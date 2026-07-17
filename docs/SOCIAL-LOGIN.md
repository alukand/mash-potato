# Sign in with Apple / Google — setup checklist

The app ships passwordless email-code sign-in today (no setup needed).
Native Apple/Google sign-in needs credentials only YOU can create; once
the steps below are done, say so and the native buttons + token wiring
get built and verified against them. Nothing app-side is blocked on this.

App Store rule to know: if the app offers Google sign-in, it MUST also
offer Sign in with Apple (guideline 4.8). So ship both or neither.

## 1. Apple (Sign in with Apple)

In [Apple Developer](https://developer.apple.com/account) → Certificates,
Identifiers & Profiles:
1. Identifiers → the app's App ID (`com.…` used by Capacitor) → enable
   the **Sign In with Apple** capability → save.
2. Keys → **+** → check Sign In with Apple → configure with the App ID →
   register → **download the .p8 once** (like the APNs key: never commit
   it) and note the Key ID.
3. Identifiers → **+ Services ID** (e.g. `com.mashpotato.signin`) —
   needed by Supabase for the secret it generates.

In Supabase dashboard → Authentication → Providers → **Apple**:
- Enable; fill Services ID, Team ID, Key ID, and paste the .p8 contents
  (Supabase derives the client secret and rotates it).

## 2. Google

In [Google Cloud Console](https://console.cloud.google.com) → APIs &
Services → Credentials (create a project if none):
1. OAuth consent screen: External, app name Mash Potato, your support
   email; publish.
2. Create Credentials → OAuth client ID → **iOS** — bundle ID = the
   Capacitor App ID. Note the iOS client ID.
3. Create Credentials → OAuth client ID → **Web application** — this one
   goes to Supabase (native flows still validate against it). Note client
   ID + secret.

In Supabase dashboard → Authentication → Providers → **Google**:
- Enable; paste the WEB client ID + secret. Add the iOS client ID under
  "Authorized Client IDs" so native id-tokens verify.

## 3. Then, app-side (I build this once the above exists)

- Capacitor plugins: `@capacitor-community/apple-sign-in` +
  a Google credential plugin; both return an identity token natively —
  no browser redirect, no deep link.
- `supabase.auth.signInWithIdToken({ provider, token, nonce })` completes
  the session; `handle_new_user` already creates the profile row (display
  name falls back to the provider's name).
- Buttons on AuthScreen per Apple's HIG (Apple button first on iOS).
- Xcode: add the Sign In with Apple capability to the target (mirrors
  step 1.1).

## Costs / gotchas

- Apple: free with the existing developer account.
- Google: free; the consent screen may sit in "unverified" until Google
  reviews it — sign-in still works for it being marked as such.
- Users who signed up with email can NOT auto-link a social login with
  the same address unless "Allow linking" is on (Supabase: Authentication
  → Providers → toggle account linking consciously).
