# Task: Add Email/Password Login (keep Google OAuth for Supabase, keep Google OAuth for Earth Engine)

## Context

This is a Vue 3 + Vite app (Ceres / NDVI rice monitor). It currently has **two separate Google OAuth flows**:

1. **Supabase Auth** — Google sign-in only, used for the app's own account system (saved fields, AOIs, Telegram linking, etc.)
2. **Earth Engine** — a completely separate Google OAuth popup (`ee.data.authenticateViaOauth`), used only to authorize satellite compute. This has its own Client ID and its own popup flow.

**The problem:** Supabase's Google provider is currently blocked for new testers because the Google OAuth consent screen is still in "Testing" mode (not published), which restricts login to a manually-added test-user allowlist. We don't want to publish/verify the OAuth consent screen (extra paperwork). Instead, we want to let anyone create an account and log in via email + password, so we can hand out a public app URL to a testing program without needing to know every tester's email ahead of time.

## What to build

Add **email + password** as a second Supabase Auth method, alongside the existing Google Auth button — do NOT remove Google Auth, just add email/password as an alternative.

### Explicitly do NOT touch

- **Earth Engine's OAuth popup and flow** — completely separate system, separate Client ID, must remain untouched and unaffected by anything in this task.
- The existing Google sign-in button/flow for Supabase — keep it working exactly as-is, just add another option next to it.

## Steps

### 1. Confirm Email provider is enabled in Supabase

In Supabase Dashboard → Authentication → Providers → **Email**, confirm it's enabled. (Usually on by default — just verify, don't need code for this part.)

### 2. Disable email confirmation

Testers must be able to sign up and log in immediately, with no confirmation email step.

In Supabase Dashboard → Authentication → Settings/Providers → Email, disable **"Confirm email"**. This is a dashboard toggle, not a code change — but confirm it's off before testing step 5, since `signUp()` will silently require confirmation (no usable session on first call) if this is left on.

### 3. Update the auth UI component

Find the existing auth overlay/modal component (likely named something like `AuthOverlay.vue` — search the project for wherever the current "Sign in with Google" button for Supabase lives).

Add:
- A toggle or tab between **"Sign in"** and **"Create account"** (email/password mode)
- Email input field
- Password input field
- Submit button
- Keep the existing "Sign in with Google" button visible alongside/above this — don't remove it, just add the email/password option as a second path in the same overlay
- Basic client-side validation (non-empty email format, minimum password length — Supabase default minimum is 6 characters unless configured otherwise)
- Error display area for failed sign-in/sign-up attempts (wrong password, email already registered, etc.) — style consistent with the existing dark-glass design system already used elsewhere in the app

### 4. Wire up the Supabase calls

Using the existing `supabase-js` client already set up in the project (check `src/services/supabase.js` for the existing client instance and patterns — reuse `requireSession()` and existing auth state patterns already in place for Google auth):

```js
// Sign up
const { data, error } = await supabase.auth.signUp({
  email,
  password,
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
});
```

- Reuse the existing `onAuthStateChange` listener already wired up for Google auth — email/password sign-in should trigger the same downstream logic (auto-load fields/AOIs, etc.) since it's the same Supabase Auth session system underneath, just a different sign-in method.
- Surface Supabase's returned `error.message` to the user in the error display area from step 3.

### 5. Test

- Sign up with a new email/password → confirm a session is created and the app loads the user's (empty) fields/AOIs dashboard, same as a fresh Google sign-in would.
- Sign out, sign back in with the same email/password → confirm existing session/data loads correctly.
- Confirm the existing Google sign-in button still works exactly as before, completely unaffected.
- Confirm Earth Engine's separate Google OAuth popup still works exactly as before, completely unaffected — this should be untouched, but worth a sanity check since it's also "Google" auth and easy to conflate.

## Out of scope for this task

- Password reset / forgot-password flow (can be a follow-up if needed)
- Publishing or verifying the Google OAuth consent screen (this task is specifically the workaround to avoid that)
- Any changes to Telegram bot linking, EE service account, or any other backend feature
