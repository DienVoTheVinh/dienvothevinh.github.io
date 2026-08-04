# VinhMath Web Push deployment

This feature is intentionally inert until its database table, secrets, Edge Functions, and database webhook are deployed together.

## Production sequence

1. Create a named Supabase migration from `create_web_push_subscriptions.sql`; review it and run security/performance advisors.
2. Generate one VAPID key pair. Never commit the private key.
3. Add Edge Function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and a long random `WEB_PUSH_WEBHOOK_SECRET`.
4. Deploy `web-push-subscribe` with JWT verification enabled.
5. Deploy `web-push-dispatch` with JWT verification disabled because it performs constant-time verification of `x-webhook-secret` itself.
6. Create a Supabase Database Webhook for `public.notifications` on `INSERT`. Point it to `web-push-dispatch` and send the same `x-webhook-secret` header.
7. Test with one teacher account and one student account on Windows/macOS plus an installed iPhone/Android web app before enabling the UI for everyone.

## Required behavior

- Permission is requested only after the user presses **Bật thông báo nổi**.
- iPhone/iPad users must first install VinhMath to the Home Screen.
- Expired push endpoints (HTTP 404/410) are deleted automatically.
- Five consecutive delivery failures disable an endpoint until that device registers again.
- Subscription rows are protected by RLS and only visible to their owner; server dispatch uses the Edge Function secret key.
