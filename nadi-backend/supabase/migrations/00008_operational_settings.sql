CREATE TABLE IF NOT EXISTS public.operational_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.operational_settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_operational_settings_updated_at
ON public.operational_settings(updated_at DESC);

CREATE OR REPLACE FUNCTION public.refund_wallet_debit(
    p_tx_id UUID,
    p_user_id UUID,
    p_amount NUMERIC,
    p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
    v_tx public.transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_tx
    FROM public.transactions
    WHERE id = p_tx_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Transaction not found');
    END IF;

    IF v_tx.status = 'failed' THEN
        RETURN jsonb_build_object('success', true, 'already_refunded', true, 'tx_id', p_tx_id);
    END IF;

    UPDATE public.wallets
    SET naira_balance = naira_balance + p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

    UPDATE public.transactions
    SET status = 'failed',
        failure_reason = p_reason,
        failed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_tx_id;

    RETURN jsonb_build_object('success', true, 'already_refunded', false, 'tx_id', p_tx_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
