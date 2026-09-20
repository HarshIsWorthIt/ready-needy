# READY/NEEDY

READY/NEEDY is an Expo SDK 57 app for dispatching nearby human assistance in real time. People switch between **READY** (I can help) and **NEEDY** (I need help) modes; open requests broadcast to Ready users nearby and are matched transactionally.

## Run locally

```powershell
npm install
npm run web
```

The local demo works without Supabase credentials. The Expo web server uses port 8082 and will choose another port if that port is already occupied.

```powershell
npm run typecheck
```

## Architecture

```
App.tsx                    # App shell: navigation, feedback banner, screen switch
src/
  config.ts                # Environment variables + dispatch limits (single source of truth)
  errors.ts                # AppError, user-facing messages, error reporting hook
  supabase.ts              # Supabase client + session user resolution (auth.uid() based)
  auth.ts                  # Magic-link sign-in, profile upsert, session restore
  repository.ts            # Dispatch data layer: requests, matching, ratings, realtime
  device.ts                # Location + push token registration
  permissions.ts           # Camera / notification permission helpers
  logic.ts                 # Pure validation + signal state logic
  types.ts                 # Shared domain types
  mockData.ts              # Seed data for the offline demo mode
supabase/
  schema.sql               # Tables, RLS policies, PostGIS matching RPCs, triggers
  functions/
    create-reward-checkout # Stripe checkout Edge Function (idempotent, server-side keys)
```

**Key production properties:**

- Every remote call keys off the **Supabase Auth session user** (`auth.uid()`) — no static user ids in env files.
- Row Level Security owns authorization: participants see their requests, Ready users discover nearby open requests within radius, ratings recompute profile scores via triggers.
- `accept_helper_for_request` locks the request row, rejects self-acceptance, and transitions `SEARCHING → PARTIALLY_MATCHED → MATCHED` atomically.
- The payment Edge Function validates ownership, UUID input, positive amounts, and uses an idempotency key per request.

## Enable Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env` and fill in the project URL and anon key.
3. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor.
4. Enable Realtime for the `requests` table if it is not enabled by the migration.
5. Restart Expo after changing environment variables.

With the variables present, the app uses Supabase for magic-link sign-in, request creation, nearby Ready-user lookup, transactional helper acceptance, request lifecycle updates, and ratings. Without them, the same flow uses the in-memory repository so the prototype remains runnable.

Sign-in uses a passwordless **magic link** emailed to the user; the profile row in `public.users` is created automatically on first sign-in.

## Release integrations

- Native Ready mode requests foreground location through `expo-location`.
- Native onboarding requests push permission through `expo-notifications`; the resulting Expo token is stored per-device in `device_tokens`.
- Rewards use the `create-reward-checkout` Supabase Edge Function boundary in `src/payments.ts`. Keep Stripe secrets server-side and set `EXPO_PUBLIC_PAYMENTS_ENABLED=true` only after that function is deployed.
- Android and iOS permission text is configured in [app.json](app.json).
- Deploy the payment function with `supabase functions deploy create-reward-checkout --no-verify-jwt=false`, configure `STRIPE_SECRET_KEY` (and optionally `ALLOWED_ORIGINS`) as Supabase secrets.

Before store release, configure EAS credentials, Supabase Auth redirect URLs, push credentials, the payment Edge Function, crash monitoring (wire `reportError` in `src/errors.ts` to Sentry or similar), privacy policy, and legal consent screens.

## Dispatch contract

- `find_nearby_ready_users` uses PostGIS geography distance filtering.
- `accept_helper_for_request` locks the request row, prevents duplicate helper assignments and self-acceptance, and transitions the request to `PARTIALLY_MATCHED` or `MATCHED`.
- `expire_stale_requests` ( callable via pg_cron or a scheduled Edge Function) expires requests older than 2 hours.
- `requests` updates are published through Supabase Realtime for active request screens.
- Ratings insert into `ratings`; a trigger recomputes `users.rating`.