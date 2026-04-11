# SecurePool — manual QA checklist

Run after deploy or before release. Check browser **Console** (no red errors) and **Network** (APIs 2xx).

## Critical flows (smoke)

1. **Auth**
   - [ ] Login → lands on dashboard (or intended route)
   - [ ] Logout → cannot open `/dashboard` without login
   - [ ] Non-admin cannot open `/admin`

2. **Pools**
   - [ ] `/pools` lists pools (or empty state message, not blank)
   - [ ] Open a pool detail → data loads; back navigation works

3. **Wallet**
   - [ ] `/wallet` shows balances (numbers, not `NaN`)
   - [ ] Transaction list loads or empty state

4. **Admin** (admin account only)
   - [ ] `/admin` loads
   - [ ] Pending deposits / users list loads
   - [ ] Delete user error path: failure shows toast without leaking raw DB text (no Postgres detail in UI)

## Optional deeper pass

- [ ] Deposit wizard: QR / copy address (if enabled)
- [ ] Signup + email OTP (if SMTP configured)
