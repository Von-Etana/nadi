-- Stored procedures for atomic cryptocurrency operations in wallets

-- 1. Execute Crypto Purchase (Debit Naira, Credit Crypto)
CREATE OR REPLACE FUNCTION public.execute_crypto_purchase(
    p_user_id UUID,
    p_symbol TEXT,
    p_amount_naira NUMERIC,
    p_crypto_qty NUMERIC,
    p_ref TEXT
) RETURNS JSONB AS $$
DECLARE
    v_naira_balance NUMERIC;
    v_crypto_balances JSONB;
    v_tx_id UUID;
    v_symbol TEXT;
BEGIN
    v_symbol := LOWER(p_symbol);

    -- Lock wallet for transaction
    SELECT naira_balance, crypto_balances INTO v_naira_balance, v_crypto_balances
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Verify Naira balance
    IF v_naira_balance < p_amount_naira THEN
        RAISE EXCEPTION 'Insufficient Naira balance';
    END IF;

    -- Update Naira balance
    UPDATE public.wallets
    SET naira_balance = naira_balance - p_amount_naira,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Update or insert crypto balance
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem
        WHERE elem->>'symbol' = v_symbol
    ) THEN
        SELECT jsonb_agg(
            CASE WHEN elem->>'symbol' = v_symbol
                THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC + p_crypto_qty))
                ELSE elem
            END
        ) INTO v_crypto_balances
        FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem;
    ELSE
        v_crypto_balances := COALESCE(v_crypto_balances, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('symbol', v_symbol, 'balance', p_crypto_qty)
        );
    END IF;

    UPDATE public.wallets
    SET crypto_balances = v_crypto_balances,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, crypto_details, completed_at
    ) VALUES (
        p_ref, p_user_id, 'buy', 'crypto', p_amount_naira, 'NGN', p_amount_naira, 'completed', 'debit',
        'Bought ' || p_crypto_qty || ' ' || UPPER(p_symbol),
        jsonb_build_object(
            'symbol', v_symbol,
            'quantity', p_crypto_qty,
            'rate', p_amount_naira / p_crypto_qty,
            'currency', 'NGN'
        ),
        NOW()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Execute Crypto Sale (Debit Crypto, Credit Naira)
CREATE OR REPLACE FUNCTION public.execute_crypto_sale(
    p_user_id UUID,
    p_symbol TEXT,
    p_crypto_qty NUMERIC,
    p_naira_credit NUMERIC,
    p_ref TEXT
) RETURNS JSONB AS $$
DECLARE
    v_crypto_balances JSONB;
    v_current_balance NUMERIC := 0;
    v_tx_id UUID;
    v_symbol TEXT;
BEGIN
    v_symbol := LOWER(p_symbol);

    -- Lock wallet
    SELECT crypto_balances INTO v_crypto_balances
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Find current balance
    SELECT (elem->>'balance')::NUMERIC INTO v_current_balance
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem
    WHERE elem->>'symbol' = v_symbol;

    IF v_current_balance IS NULL OR v_current_balance < p_crypto_qty THEN
        RAISE EXCEPTION 'Insufficient crypto balance for %', UPPER(p_symbol);
    END IF;

    -- Update crypto balance
    SELECT jsonb_agg(
        CASE WHEN elem->>'symbol' = v_symbol
            THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC - p_crypto_qty))
            ELSE elem
        END
    ) INTO v_crypto_balances
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem;

    UPDATE public.wallets
    SET crypto_balances = v_crypto_balances,
        naira_balance = naira_balance + p_naira_credit,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, crypto_details, completed_at
    ) VALUES (
        p_ref, p_user_id, 'sell', 'crypto', p_naira_credit, 'NGN', p_naira_credit, 'completed', 'credit',
        'Sold ' || p_crypto_qty || ' ' || UPPER(p_symbol),
        jsonb_build_object(
            'symbol', v_symbol,
            'quantity', p_crypto_qty,
            'rate', p_naira_credit / p_crypto_qty,
            'currency', 'NGN'
        ),
        NOW()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Execute Crypto Swap (Debit from_crypto, Credit to_crypto)
CREATE OR REPLACE FUNCTION public.execute_crypto_swap(
    p_user_id UUID,
    p_from_symbol TEXT,
    p_to_symbol TEXT,
    p_from_qty NUMERIC,
    p_to_qty NUMERIC,
    p_ref TEXT
) RETURNS JSONB AS $$
DECLARE
    v_crypto_balances JSONB;
    v_from_balance NUMERIC := 0;
    v_tx_id UUID;
    v_from_symbol TEXT;
    v_to_symbol TEXT;
BEGIN
    v_from_symbol := LOWER(p_from_symbol);
    v_to_symbol := LOWER(p_to_symbol);

    -- Lock wallet
    SELECT crypto_balances INTO v_crypto_balances
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Find current from_crypto balance
    SELECT (elem->>'balance')::NUMERIC INTO v_from_balance
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem
    WHERE elem->>'symbol' = v_from_symbol;

    IF v_from_balance IS NULL OR v_from_balance < p_from_qty THEN
        RAISE EXCEPTION 'Insufficient crypto balance for %', UPPER(p_from_symbol);
    END IF;

    -- Deduct from_crypto balance
    SELECT jsonb_agg(
        CASE WHEN elem->>'symbol' = v_from_symbol
            THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC - p_from_qty))
            ELSE elem
        END
    ) INTO v_crypto_balances
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem;

    -- Add to_crypto balance
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_crypto_balances) elem
        WHERE elem->>'symbol' = v_to_symbol
    ) THEN
        SELECT jsonb_agg(
            CASE WHEN elem->>'symbol' = v_to_symbol
                THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC + p_to_qty))
                ELSE elem
            END
        ) INTO v_crypto_balances
        FROM jsonb_array_elements(v_crypto_balances) elem;
    ELSE
        v_crypto_balances := v_crypto_balances || jsonb_build_array(
            jsonb_build_object('symbol', v_to_symbol, 'balance', p_to_qty)
        );
    END IF;

    UPDATE public.wallets
    SET crypto_balances = v_crypto_balances,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Log transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, crypto_details, completed_at
    ) VALUES (
        p_ref, p_user_id, 'swap', 'crypto', p_from_qty, UPPER(p_from_symbol), p_from_qty, 'completed', 'debit',
        'Swapped ' || p_from_qty || ' ' || UPPER(p_from_symbol) || ' to ' || p_to_qty || ' ' || UPPER(p_to_symbol),
        jsonb_build_object(
            'from_symbol', v_from_symbol,
            'to_symbol', v_to_symbol,
            'from_quantity', p_from_qty,
            'to_quantity', p_to_qty
        ),
        NOW()
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Execute Crypto Withdrawal (Debit Crypto and log pending transaction)
CREATE OR REPLACE FUNCTION public.execute_crypto_withdrawal(
    p_user_id UUID,
    p_symbol TEXT,
    p_amount NUMERIC,
    p_ref TEXT,
    p_address TEXT
) RETURNS JSONB AS $$
DECLARE
    v_crypto_balances JSONB;
    v_current_balance NUMERIC := 0;
    v_tx_id UUID;
    v_symbol TEXT;
BEGIN
    v_symbol := LOWER(p_symbol);

    -- Lock wallet
    SELECT crypto_balances INTO v_crypto_balances
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Check crypto balance
    SELECT (elem->>'balance')::NUMERIC INTO v_current_balance
    FROM jsonb_array_elements(COALESCE(v_crypto_balances, '[]'::jsonb)) elem
    WHERE elem->>'symbol' = v_symbol;

    IF v_current_balance IS NULL OR v_current_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient crypto balance for %', UPPER(p_symbol);
    END IF;

    -- Deduct crypto balance
    SELECT jsonb_agg(
        CASE WHEN elem->>'symbol' = v_symbol
            THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC - p_amount))
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
        description, crypto_details
    ) VALUES (
        p_ref, p_user_id, 'withdrawal', 'crypto', p_amount, UPPER(p_symbol), p_amount, 'pending', 'debit',
        'Crypto withdrawal of ' || p_amount || ' ' || UPPER(p_symbol) || ' to ' || p_address,
        jsonb_build_object(
            'symbol', v_symbol,
            'quantity', p_amount,
            'address', p_address
        )
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 5. Refund Crypto Withdrawal (Credit Crypto back on gateway failure)
CREATE OR REPLACE FUNCTION public.refund_crypto_withdrawal(
    p_tx_id UUID,
    p_user_id UUID,
    p_symbol TEXT,
    p_amount NUMERIC,
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
            THEN jsonb_set(elem, '{balance}', to_jsonb((elem->>'balance')::NUMERIC + p_amount))
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
