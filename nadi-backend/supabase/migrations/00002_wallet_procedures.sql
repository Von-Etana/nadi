-- Function to check and update daily transaction limits atomically under a FOR UPDATE lock
CREATE OR REPLACE FUNCTION public.check_and_update_wallet_limit(
    p_wallet_id UUID,
    p_type TEXT, -- 'transfer' or 'withdrawal'
    p_amount NUMERIC
) RETURNS VOID AS $$
DECLARE
    v_limits JSONB;
    v_daily_usage JSONB;
    v_today TEXT;
    v_single_limit NUMERIC;
    v_daily_limit NUMERIC;
    v_current_daily_total NUMERIC;
BEGIN
    -- Select limits and daily usage from wallet
    SELECT limits, daily_usage INTO v_limits, v_daily_usage
    FROM public.wallets
    WHERE id = p_wallet_id;

    v_today := TO_CHAR(NOW(), 'YYYY-MM-DD');

    -- Resolve single and daily limit thresholds
    IF p_type = 'transfer' THEN
        v_single_limit := COALESCE((v_limits->>'singleTransfer')::NUMERIC, 200000.00);
        v_daily_limit := COALESCE((v_limits->>'dailyTransfer')::NUMERIC, 500000.00);
    ELSIF p_type = 'withdrawal' THEN
        v_single_limit := 9999999999.00; -- Very high fallback
        v_daily_limit := COALESCE((v_limits->>'dailyWithdrawal')::NUMERIC, 1000000.00);
    ELSE
        RAISE EXCEPTION 'Invalid transaction type for limit check';
    END IF;

    -- Validate single transaction limit
    IF p_amount > v_single_limit THEN
        RAISE EXCEPTION 'Single % limit is ₦%', p_type, TO_CHAR(v_single_limit, 'FM999,999,990.00');
    END IF;

    -- Initialize daily usage if date is different or null
    IF v_daily_usage IS NULL OR v_daily_usage->>'date' IS NULL OR v_daily_usage->>'date' != v_today THEN
        v_daily_usage := jsonb_build_object(
            'date', v_today,
            'transfers', 0.00,
            'withdrawals', 0.00,
            'deposits', 0.00
        );
    END IF;

    -- Get current daily total
    IF p_type = 'transfer' THEN
        v_current_daily_total := COALESCE((v_daily_usage->>'transfers')::NUMERIC, 0.00);
    ELSE
        v_current_daily_total := COALESCE((v_daily_usage->>'withdrawals')::NUMERIC, 0.00);
    END IF;

    -- Check if it exceeds daily limit
    IF (v_current_daily_total + p_amount) > v_daily_limit THEN
        RAISE EXCEPTION 'Daily % limit of ₦% exceeded', p_type, TO_CHAR(v_daily_limit, 'FM999,999,990.00');
    END IF;

    -- Update daily usage object
    IF p_type = 'transfer' THEN
        v_daily_usage := jsonb_set(v_daily_usage, '{transfers}', to_jsonb(v_current_daily_total + p_amount));
    ELSE
        v_daily_usage := jsonb_set(v_daily_usage, '{withdrawals}', to_jsonb(v_current_daily_total + p_amount));
    END IF;

    -- Save back to wallet
    UPDATE public.wallets
    SET daily_usage = v_daily_usage
    WHERE id = p_wallet_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely transfer money between wallets under a transaction to prevent TOCTOU race conditions
CREATE OR REPLACE FUNCTION public.execute_wallet_transfer(
    p_sender_id UUID,
    p_recipient_id UUID,
    p_amount NUMERIC,
    p_sender_ref TEXT,
    p_recipient_ref TEXT,
    p_narration TEXT
) RETURNS JSONB AS $$
DECLARE
    v_sender_balance NUMERIC;
    v_recipient_name TEXT;
    v_recipient_email TEXT;
    v_sender_name TEXT;
    v_sender_email TEXT;
    v_sender_tx_id UUID;
    v_recipient_tx_id UUID;
    v_sender_wallet_id UUID;
BEGIN
    -- Get sender details
    SELECT first_name || ' ' || last_name, email INTO v_sender_name, v_sender_email
    FROM public.users WHERE id = p_sender_id;
    
    -- Get recipient details
    SELECT first_name || ' ' || last_name, email INTO v_recipient_name, v_recipient_email
    FROM public.users WHERE id = p_recipient_id;

    -- Lock sender wallet row and check balance
    SELECT id, naira_balance INTO v_sender_wallet_id, v_sender_balance
    FROM public.wallets
    WHERE user_id = p_sender_id
    FOR UPDATE;

    IF v_sender_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Validate and update daily limit
    PERFORM public.check_and_update_wallet_limit(v_sender_wallet_id, 'transfer', p_amount);

    -- Deduct from sender wallet
    UPDATE public.wallets
    SET naira_balance = naira_balance - p_amount,
        updated_at = NOW()
    WHERE id = v_sender_wallet_id;

    -- Add to recipient wallet
    UPDATE public.wallets
    SET naira_balance = naira_balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_recipient_id;

    -- Insert sender transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        counterparty, description, processed_at, completed_at
    ) VALUES (
        p_sender_ref, p_sender_id, 'transfer', 'wallet', p_amount, 'NGN', p_amount, 'completed', 'debit',
        jsonb_build_object('user', p_recipient_id, 'name', v_recipient_name, 'email', v_recipient_email),
        COALESCE(p_narration, 'Transfer to ' || v_recipient_name),
        NOW(), NOW()
    ) RETURNING id INTO v_sender_tx_id;

    -- Insert recipient transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        counterparty, description, processed_at, completed_at
    ) VALUES (
        p_recipient_ref, p_recipient_id, 'transfer', 'wallet', p_amount, 'NGN', p_amount, 'completed', 'credit',
        jsonb_build_object('user', p_sender_id, 'name', v_sender_name, 'email', v_sender_email),
        COALESCE(p_narration, 'Transfer from ' || v_sender_name),
        NOW(), NOW()
    ) RETURNING id INTO v_recipient_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'sender_tx_id', v_sender_tx_id,
        'recipient_tx_id', v_recipient_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely process a withdrawal/debit
CREATE OR REPLACE FUNCTION public.execute_wallet_debit(
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
    v_balance NUMERIC;
    v_tx_id UUID;
BEGIN
    -- Lock wallet and check balance
    SELECT naira_balance INTO v_balance
    FROM public.wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    -- Deduct from wallet
    UPDATE public.wallets
    SET naira_balance = naira_balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Create pending transaction
    INSERT INTO public.transactions (
        reference, user_id, type, category, amount, currency, net_amount, status, direction,
        description, metadata, utility_details, giftcard_details, crypto_details, logistics_details, fuel_details
    ) VALUES (
        p_ref, p_user_id, p_type, p_category, p_amount, 'NGN', p_amount, 'pending', 'debit',
        p_description, p_metadata,
        CASE WHEN p_category = 'utility' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'giftcard' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'crypto' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'logistics' THEN p_details ELSE NULL END,
        CASE WHEN p_category = 'fuel' THEN p_details ELSE NULL END
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object(
        'success', true,
        'tx_id', v_tx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to safely refund a debit in case the external API fails
CREATE OR REPLACE FUNCTION public.refund_wallet_debit(
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

-- Function to safely append a user referral record atomically
CREATE OR REPLACE FUNCTION public.append_user_referral(
    p_referrer_id UUID,
    p_referred_id UUID
) RETURNS VOID AS $$
BEGIN
    UPDATE public.users
    SET referrals = COALESCE(referrals, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
            'user', p_referred_id,
            'date', TO_CHAR(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'bonusPaid', false
        )
    )
    WHERE id = p_referrer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
