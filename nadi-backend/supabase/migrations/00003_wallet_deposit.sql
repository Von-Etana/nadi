-- Function to safely process a deposit/credit atomically
CREATE OR REPLACE FUNCTION public.execute_wallet_deposit(
    p_user_id UUID,
    p_amount NUMERIC,
    p_ref TEXT,
    p_provider_name TEXT,
    p_provider_ref TEXT,
    p_auth_code TEXT
) RETURNS JSONB AS $$
DECLARE
    v_tx_id UUID;
    v_tx_status TEXT;
BEGIN
    -- Lock transaction row if it exists to prevent race conditions
    SELECT status, id INTO v_tx_status, v_tx_id
    FROM public.transactions
    WHERE reference = p_ref
    FOR UPDATE;

    -- If already completed, do nothing (idempotency check)
    IF v_tx_status = 'completed' THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'tx_id', v_tx_id);
    END IF;

    IF v_tx_id IS NOT NULL THEN
        -- Update existing pending transaction to completed
        UPDATE public.transactions
        SET status = 'completed',
            completed_at = NOW(),
            provider = jsonb_build_object('name', p_provider_name, 'reference', p_provider_ref, 'authorizationCode', p_auth_code),
            updated_at = NOW()
        WHERE id = v_tx_id;
    ELSE
        -- Create a new completed transaction if the reference wasn't pre-created
        INSERT INTO public.transactions (
            reference, user_id, type, category, amount, currency, net_amount, status, direction,
            payment_method, provider, description, processed_at, completed_at
        ) VALUES (
            p_ref, p_user_id, 'deposit', 'wallet', p_amount, 'NGN', p_amount, 'completed', 'credit',
            'card', jsonb_build_object('name', p_provider_name, 'reference', p_provider_ref, 'authorizationCode', p_auth_code),
            'Wallet funding', NOW(), NOW()
        ) RETURNING id INTO v_tx_id;
    END IF;

    -- Increment wallet balance
    UPDATE public.wallets
    SET naira_balance = naira_balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
