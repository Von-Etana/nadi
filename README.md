# Nadi Digital Service

Production readiness checklist:

- Rotate any Supabase, Flutterwave, Termii, Reloadly, what3words, Resend, or Quidax keys that were ever stored locally or shared outside the deployment secret manager.
- Configure production `FRONTEND_URL`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_SECRET`, `RESEND_API_KEY`, and `QUIDAX_API_KEY` on the backend host.
- Configure production `VITE_API_BASE_URL`, `VITE_WS_URL`, `VITE_FLUTTERWAVE_PUBLIC_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` on the frontend host.
- Run every Supabase migration in `nadi-backend/supabase/migrations` before accepting users or money movement.
- Verify the release with:
  - `npm.cmd test -- --runInBand` from `nadi-backend`
  - `npm.cmd audit --audit-level=moderate` from `nadi-backend`
  - `npm.cmd run lint` from `app`
  - `npm.cmd run build` from `app`
  - `npm.cmd audit --audit-level=moderate` from `app`
