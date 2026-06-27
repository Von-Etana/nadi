-- Stored procedures for additional wallet credit and debit actions (Crypto/Naira)

-- 1. Execute Crypto Debit (Deducts crypto and logs a pending transaction)
CREATE OR REPLACE FUNCTION public.execute_crypto_debit(
    p_user_id UUID,
    p_symbol TEXT,
    p_amount_crypto NUMERIC,
    p_amount_naira NUMERIC,
    p_ref TEXT,
    p_type TEXT,
    p_category TEXT,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_details JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_crypto_balances JSONB;
    v_current_balance NUMERIC := 0;
    v_tx_id UUID;
    v_symbol TEXT;
BEGIN
    v_symbol := LOWER(p_symbol);

    -- Lock wallet and check balance
    SELECT crypto_balances INTO v_crypto_balances
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Extract current balance
    SELECT (elem->>'balance')::NUMERIC INTO v_current_balance
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem
    WHERE elem->>'symbol' = v_symbol;

    IF v_current_balance IS NULL OR v_current_balance < p_amount_crypto THEN
        RAISE EXCEPTION 'Insufficient crypto balance for %', UPPER(p_symbol);
    END IF;

    -- Deduct crypto balance
    SELECT jsonb_agg(
        CASE WHEN elem->>'symbol' = v_symbol
            THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC - p_amount_crypto))
            ELSE elem
        END
    ) INTO v_crypto_balances
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem;

    UPDATE public.wallets
    SET crypto_balances = v_crypto_balances,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Create pending transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, metadata, 
        crypto_details,
        utility_details, giftcard_details, logistics_details, fuel_details
    ) VALUES (
        p_ref, p_user_id, p_type, p_category, p_amount_naira, 'NGN', p_amount_naira, 'pending', 'debit',
        p_description, p_metadata,
        jsonb_build_object(
            'symbol', v_symbol,
            'quantity', p_amount_crypto,
            'rate', CASE WHEN p_amount_crypto > 0 THEN p_amount_naira / p_amount_crypto ELSE 0 END,
            'currency', 'NGN'
        ),
        CASE WHEN p_category = 'utility' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'giftcard' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'logistics' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'fuel' THEN p_details ELSE NULL END
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Refund Crypto Debit (Refunds crypto on failure and marks transaction as failed)
CREATE OR REPLACE FUNCTION public.refund_crypto_debit(
    p_tx_id UUID,
    p_user_id UUID,
    p_symbol TEXT,
    p_amount_crypto NUMERIC,
    p_reason TEXT
) RETURNS VOID AS $$
DECLARE
    v_crypto_balances JSONB;
    v_symbol TEXT;
BEGIN
    v_symbol := LOWER(p_symbol);

    -- Lock wallet
    SELECT crypto_balances INTO v_crypto_balances
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Refund crypto balance
    SELECT jsonb_agg(
        CASE WHEN elem->>'symbol' = v_symbol
            THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC + p_amount_crypto))
            ELSE elem
        END
    ) INTO v_crypto_balances
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem;

    UPDATE public.wallets
    SET crypto_balances = v_crypto_balances,
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


-- 3. Execute Wallet Credit (Credits Naira wallet and logs a completed transaction)
CREATE OR REPLACE FUNCTION public.execute_wallet_credit(
    p_user_id UUID,
    p_amount NUMERIC,
    p_ref TEXT,
    p_type TEXT,
    p_category TEXT,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_details JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_tx_id UUID;
BEGIN
    -- Credit wallet
    UPDATE public.wallets
    SET naira_balance = naira_balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log completed transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, metadata, utility_details, giftcard_details, crypto_details, logistics_details, fuel_details,
        completed_at
    ) VALUES (
        p_ref, p_user_id, p_type, p_category, p_amount, 'NGN', p_amount, 'completed', 'credit',
        p_description, p_metadata,
        CASE WHEN p_category = 'utility' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'giftcard' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'crypto' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'logistics' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'fuel' THEN p_details ELSE NULL END,
        NOW()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Execute Crypto Credit (Credits crypto balance and logs a completed transaction)
CREATE OR REPLACE FUNCTION public.execute_crypto_credit(
    p_user_id UUID,
    p_symbol TEXT,
    p_amount_crypto NUMERIC,
    p_amount_naira NUMERIC,
    p_ref TEXT,
    p_type TEXT,
    p_category TEXT,
    p_description TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_details JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_crypto_balances JSONB;
    v_tx_id UUID;
    v_symbol TEXT;
BEGIN
    v_symbol := LOWER(p_symbol);

    -- Lock wallet
    SELECT crypto_balances INTO v_crypto_balances
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Update or insert crypto balance
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem
        WHERE elem->>'symbol' = v_symbol
    ) THEN
        SELECT jsonb_agg(
            CASE WHEN elem->>'symbol' = v_symbol
                THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC + p_amount_crypto))
                ELSE elem
            END
        ) INTO v_crypto_balances
        FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem;
    ELSE
        v_crypto_balances := COALESCE(v_crypto_balances, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('symbol', v_symbol, 'balance', p_amount_crypto)
        );
    END IF;

    UPDATE public.wallets
    SET crypto_balances = v_crypto_balances,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, metadata,
        crypto_details,
        utility_details, giftcard_details, logistics_details, fuel_details,
        completed_at
    ) VALUES (
        p_ref, p_user_id, p_type, p_category, p_amount_naira, 'NGN', p_amount_naira, 'completed', 'credit',
        p_description, p_metadata,
        jsonb_build_object(
            'symbol', v_symbol,
            'quantity', p_amount_crypto,
            'rate', CASE WHEN p_amount_crypto > 0 THEN p_amount_naira / p_amount_crypto ELSE 0 END,
            'currency', 'NGN'
        ),
        CASE WHEN p_category = 'utility' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'giftcard' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'logistics' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'fuel' THEN p_details ELSE NULL END,
        NOW()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
