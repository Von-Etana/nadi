-- Function to safely process a withdrawal/debit atomically
CREATE OR REPLACE FUNCTION public.execute_wallet_withdrawal(
    p_user_id UUID,
    p_amount NUMERIC,
    p_ref TEXT,
    p_account_name TEXT,
    p_account_number TEXT,
    p_bank_code TEXT
) RETURNS JSONB AS $$
DECLARE
    v_wallet_id UUID;
    v_balance NUMERIC;
    v_tx_id UUID;
BEGIN
    -- Lock wallet and check balance
    SELECT id, naira_balance INTO v_wallet_id, v_balance
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Validate and update daily limit
    PERFORM public.check_and_update_wallet_limit(v_wallet_id, 'withdrawal', p_amount);

    -- Deduct from wallet
    UPDATE public.wallets
    SET naira_balance = naira_balance - p_amount,
        updated_at = NOW()
    WHERE id = v_wallet_id;

    -- Create pending transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, metadata
    ) VALUES (
        p_ref, p_user_id, 'withdrawal', 'wallet', p_amount, 'NGN', p_amount, 'pending', 'debit',
        'Bank withdrawal to ' || p_account_name || ' (' || p_account_number || ')',
        jsonb_build_object(
            'accountName', p_account_name,
            'accountNumber', p_account_number,
            'bankCode', p_bank_code
        )
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely refund a withdrawal debit in case the external API fails
CREATE OR REPLACE FUNCTION public.refund_wallet_withdrawal(
    p_tx_id UUID,
    p_user_id UUID,
    p_amount NUMERIC,
    p_reason TEXT
) RETURNS VOID AS $$
BEGIN
    -- Refund wallet balance
    UPDATE public.wallets
    SET naira_balance = naira_balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Update transaction status to failed
    UPDATE public.transactions
    SET status = 'failed',
        failure_reason = p_reason,
        failed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
