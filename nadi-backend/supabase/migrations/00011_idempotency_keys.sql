-- Migration 00011: Idempotency Keys for Webhook Replay Protection
-- Created: 2026-08-13

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  reference VARCHAR(255) NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_idempotency_event_id ON public.idempotency_keys(event_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_reference ON public.idempotency_keys(reference);

-- Enable RLS
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Allow service role access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'idempotency_keys' AND policyname = 'Service role full access on idempotency_keys'
  ) THEN
    CREATE POLICY "Service role full access on idempotency_keys"
      ON public.idempotency_keys
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
