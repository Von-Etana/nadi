# Scratchpad

## 2026-07-22 Login QA - Random Credentials

Flow requested:
- Open `http://localhost:5173/`
- Navigate to `/login`
- Attempt login with `test123@fakeemail.com` / `wrongpassword123`
- Observe redirects, UI changes, errors, console logs, and network requests

Evidence collected:
- `GET http://localhost:5173/` returned `200`, so the frontend route is reachable.
- `POST http://localhost:5000/api/v1/auth/login` with the requested credentials returned `401`.
- This confirms the backend rejects the nonexistent user and does not issue a token for these credentials.

Browser automation status:
- In-app Browser setup timed out and reset before a controllable tab could be created.
- Playwright fallback launched Chrome/Edge but browser navigation to local Vite routes timed out before the React login form mounted.
- `curl` could reach `localhost:5173`, so the failure appears to be local browser automation/runtime instability rather than the auth endpoint accepting bad credentials.
- Screenshot capture could not be completed because the browser page never reached the mounted login form.

Result:
- Login is rejected for `test123@fakeemail.com` / `wrongpassword123` at the live backend auth endpoint (`401`).
- No UI bug was confirmed from browser interaction because the browser automation layer could not load the local app reliably on this host.

## 2026-07-24 Production Vercel Auth QA

Target:
- `https://nadi-digital.vercel.app/`
- Credentials tested: `test123@fakeemail.com` / `wrongpassword123`

Findings:
- The live Vercel homepage serves `./assets/index-CjX4Gwtz.js` from the repository root static bundle.
- Clicking the live Login button opens a client-side login view on `/`, not the hardened `/login` route from `app/`.
- Submitting the fake credentials enters a demo dashboard state showing `John Doe` and `test123@fakeemail.com`.
- Direct routes `https://nadi-digital.vercel.app/login` and therefore admin deep links return Vercel `404: NOT_FOUND`, so the deployed SPA rewrite is not active for this project.
- The deployed static bundle contains the old `onLogin`/`onRegister` in-memory state machine markers from `src/App.tsx`; it is not the current hardened `app/` build.

Fix applied locally:
- Added root `vercel.json` to build `app/` with `npm --prefix app ci` and `npm --prefix app run build`, outputting `app/dist`.
- Added root `package.json` scripts for Vercel/root build and verification.
- Removed tracked stale root `index.html`, `assets/index-CjX4Gwtz.js`, and `assets/index-D11c42YR.css`.

Verification:
- `npm run build` passed and produced `app/dist`.
- Production preview returned `200` for `/`, `/login`, `/admin`, and `/admin/login`.
- Built bundle no longer contains the old `onLogin:p` demo-login marker or `Track Package` sidebar text.
- `npm run lint` passed.
- `npm --prefix nadi-backend test -- --runInBand src/routes/auth.test.js` passed 10/10.

Deployment note:
- The connected Vercel team does not list a `nadi-digital` project, and `_get_deployment` for `nadi-digital.vercel.app` returned 404.
- The live project must be redeployed from the correct Vercel project/account, or that project must be connected to this repo so the new root Vercel config is used.
