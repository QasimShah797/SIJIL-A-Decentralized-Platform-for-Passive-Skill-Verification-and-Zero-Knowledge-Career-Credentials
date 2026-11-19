# SIJIL learner signup — Supabase Email OTP

Local app code uses Supabase Auth `signUp` + `verifyOtp({ type: "signup" })`.
**Do not change hosted Auth settings until explicitly approved.**

## Dashboard settings required (manual)

In Supabase project `nhzvtqpplfruzocframc`:

1. **Authentication → Providers → Email**
   - Enable Email provider
   - Enable **Confirm email**
   - Prefer OTP / confirmation code in the Confirm signup template (`{{ .Token }}`)

2. **Authentication → URL Configuration**
   - Site URL: your frontend origin (e.g. `http://localhost:8080`)
   - Redirect URLs include:
     - `http://localhost:8080/signup/learner/verify-email`
     - production verify-email URL when deployed

3. **Authentication → Emails → Confirm signup**
   - Subject / body: use the template below
   - Include `{{ .Token }}` (6-digit OTP). Optional: `{{ .ConfirmationURL }}` as backup link

4. **Authentication → SMTP (custom)** — optional but recommended for deliverability
   - Host / port / user from your Gmail SMTP app password setup
   - Sender name: `SIJIL`
   - Sender email: the same mailbox you already use for backend mail
   - **Never commit SMTP passwords.** Set them only in the Supabase Dashboard secrets UI.

## Confirm signup email template

Subject:

```text
Your SIJIL verification code
```

Body (HTML):

```html
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">
  <h1 style="font-size:22px;color:#023E8A;margin:0 0 12px;">Verify your SIJIL account</h1>
  <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">
    Welcome to SIJIL — Decentralized Platform for Passive Skill Verification and Zero-Knowledge Career Credentials.
  </p>
  <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">
    Enter this one-time code to confirm your email and activate your learner account:
  </p>
  <p style="font-size:32px;letter-spacing:0.35em;font-weight:700;color:#023E8A;margin:8px 0 20px;">
    {{ .Token }}
  </p>
  <p style="font-size:13px;line-height:1.5;color:#64748b;margin:0 0 12px;">
    This code expires shortly. If you did not create a SIJIL account, you can ignore this email.
  </p>
  <p style="font-size:12px;color:#94a3b8;margin:24px 0 0;">
    SIJIL · Secure professional identity
  </p>
</div>
```

## Troubleshooting: "Sign up failed — Failed to fetch"

That message comes from the **browser fetch** to Supabase Auth, not the local Express API.

- Failed endpoint: `POST https://<project-ref>.supabase.co/auth/v1/signup`
- Category: network / timeout (Auth + Confirm-email mailer latency)
- Local code already defers role/profile until OTP verification when `session` is null

Checklist:

1. Confirm `.env.local` has `VITE_SUPABASE_URL=https://nhzvtqpplfruzocframc.supabase.co` and a real anon key, then **restart** Vite on port 8080.
2. In Supabase → Authentication → URL Configuration, allow `http://localhost:8080/signup/learner/verify-email`.
3. In Authentication → SMTP, confirm Gmail host/port (usually `smtp.gmail.com` + `587`) and app password are correct. Slow/failing SMTP makes signup hang and the browser shows Failed to fetch.
4. If a verification email still arrived, **do not sign up again** — open `/signup/learner/verify-email` and use Resend / the OTP.
5. If signup returns “already exists”, the Auth user was created despite the frontend error; continue on the verify-email screen.

## Controlled test (after Dashboard approval only)

1. Enable Confirm email + paste the template above.
2. Start frontend (`npm run dev`) and backend if needed.
3. Open `/signup/learner`, register a **throwaway** inbox you control.
4. Copy the 6-digit OTP from email (do not paste OTPs into chat logs).
5. Enter it on `/signup/learner/verify-email`.
6. Confirm redirect to `/learner/complete-profile` and that learner APIs work.
7. Confirm an unverified session cannot open `/learner/profile`.
8. Confirm Google/GitHub learner login and recruiter login still work unchanged.
