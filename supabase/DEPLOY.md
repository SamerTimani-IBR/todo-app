# Deploying the `create-charge` Edge Function

This function runs server-side on Supabase Edge (Deno) and is the **only**
place your Tap secret key lives. Without it, purchases will never reach
Tap's Charges API and the app can't simulate real declines.

---

## 1. Install the Supabase CLI

Global `npm install -g supabase` is no longer supported. Use one of:

**Option A — project dev dependency (recommended, no admin needed):**

From inside `todo-app/`:

```bash
npm install --save-dev supabase
```

Then prefix every command below with `npx ` (e.g. `npx supabase login`).

**Option B — Scoop on Windows (system-wide):**

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

Then commands work as plain `supabase ...`.

Verify with `npx supabase --version` (option A) or `supabase --version` (option B).

> The commands below show the bare `supabase ...` form. If you went with
> Option A, prefix them with `npx `.

## 2. Log in

```bash
supabase login
```

This opens a browser; sign in with your Supabase account.

## 3. Link this project to your Supabase project

From inside the `todo-app/` folder:

```bash
supabase link --project-ref dqzuuqltbalqvqzrrzcu
```

(That ref is your project's slug from the dashboard URL.)

## 4. Run the SQL migration for failed-transaction logging

In **Supabase Dashboard → SQL Editor**, paste and run the contents of:

```
supabase/charge_failure_logging.sql
```

This adds the `record_failed_transaction` RPC the Edge Function calls when
Tap returns a decline.

## 5. Set the Tap secret key as an Edge Function secret

```bash
supabase secrets set TAP_SECRET_KEY=sk_test_YOUR_REAL_KEY
```

⚠ The secret key lives ONLY in Supabase Edge's secret store. Never put it
in `.env.local`, never commit it, never paste it in chat.

## 6. Deploy the function

```bash
supabase functions deploy create-charge --no-verify-jwt
```

⚠ The `--no-verify-jwt` flag is **required**. It disables Supabase's
platform-level JWT verification so the browser's CORS preflight (OPTIONS
without an Authorization header) can reach our function. The function
itself still validates the JWT in code via `supabase.auth.getUser()`, so
unauthenticated requests still return 401. Without this flag, the platform
rejects the preflight with 401 and the browser refuses to send the real
POST — you'll see a `CORS policy` error in DevTools.

The command pushes `supabase/functions/create-charge/index.ts` to the cloud.
It takes ~10 seconds.

## 7. Verify deployment

Dashboard → **Edge Functions** → you should see `create-charge` listed as
"Deployed". Click it to see invocation logs once you trigger purchases.

---

## Testing real charges + failures

The function is wired into the existing Buy tokens flow. Frontend changes
are already done; you just need the function deployed.

### Successful charge
- Card `5123 4500 0000 0008`, CVV `100`, expiry `12/30`
- Result: Tap returns `CAPTURED` → tokens credited, transaction row with
  status `completed` and the real `chg_…` charge id as reference.

### Failure scenarios (test mode magic expiry dates)
Use the same card but change the expiry:

| Expiry  | Outcome              |
|---------|----------------------|
| `05/22` | DECLINED             |
| `04/27` | EXPIRED_CARD         |
| `08/28` | TIMED_OUT            |
| `01/37` | ACQUIRER_SYSTEM_ERROR|
| `02/37` | UNSPECIFIED_FAILURE  |
| `05/37` | UNKNOWN              |

For each failure: red toast appears with Tap's reason (e.g.
*"Payment failed — DECLINED: …"*), no tokens are credited, and a row with
`status: failed` is inserted into `transactions` with the reason prefixed
on the reference id. Admin Transactions table shows the failed attempts.

### Watching it work

In one terminal:

```bash
supabase functions logs create-charge --tail
```

This streams Edge Function invocations live — you'll see the Tap API call
results in real time.

---

## Troubleshooting

**"Could not reach the charge function"** — the function isn't deployed
yet. Run step 6.

**"TAP_SECRET_KEY is not configured"** — step 5 wasn't run. The function
deployed but has no secret access.

**"Unauthorized"** — the user's session expired. Have them log out and
back in.

**Function returns CORS errors in browser** — the function has
`Access-Control-Allow-Origin: *` baked in, so this shouldn't happen.
If it does, redeploy.
