# READY/NEEDY

READY/NEEDY is an Expo SDK 57 prototype for dispatching nearby human assistance in real time.

## Run locally

```powershell
npm install
npm run web
```

The local demo works without Supabase credentials. The Expo web server uses port 8082 and will choose another port if that port is already occupied.

## Enable Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env` and fill in the project URL, anon key, and an authenticated user UUID.
3. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor.
4. Enable Realtime for the `requests` table if it is not enabled by the migration.
5. Restart Expo after changing environment variables.

With the variables present, the app uses Supabase for request creation, nearby Ready-user lookup, transactional helper acceptance, and request update subscriptions. Without them, the same flow uses the in-memory repository so the prototype remains runnable.

## Release integrations

- Supabase Auth session restoration is handled by `src/auth.ts`; production sign-in should use the magic-link helper from a real email field.
- Native Ready mode requests foreground location through `expo-location`.
- Native onboarding requests push permission through `expo-notifications`; store the resulting Expo token in a server-side user profile before sending notifications.
- Rewards use the `create-reward-checkout` Supabase Edge Function boundary in `src/payments.ts`. Keep payment provider secrets server-side and set `EXPO_PUBLIC_PAYMENTS_ENABLED=true` only after that function is deployed.
- Android and iOS permission text is configured in [app.json](app.json).
- Deploy the payment function with `supabase functions deploy create-reward-checkout --no-verify-jwt=false` and configure `STRIPE_SECRET_KEY` as a Supabase secret.

Before store release, configure EAS credentials, Supabase Auth redirect URLs, push credentials, the payment Edge Function, crash monitoring, privacy policy, and legal consent screens.

## Dispatch contract

- `find_nearby_ready_users` uses PostGIS geography distance filtering.
- `accept_helper_for_request` locks the request row, prevents duplicate helper assignments, and transitions the request to `PARTIALLY_MATCHED` or `MATCHED`.
- `requests` updates are published through Supabase Realtime for active request screens.
