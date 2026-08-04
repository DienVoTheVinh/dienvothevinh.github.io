import webpush from "npm:web-push@3.6.7";

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  notificationId?: string;
  kind?: string;
};

type AdminClient = {
  from: (table: string) => any;
};

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function safeUrl(value?: string): string {
  if (!value) return "/trang-chu";
  if (value.startsWith("/") && !value.startsWith("//")) return value.slice(0, 500);
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && (parsed.hostname === "vinhmath.com" || parsed.hostname.endsWith(".vinhmath.com"))) {
      return (parsed.pathname + parsed.search + parsed.hash).slice(0, 500);
    }
  } catch (_) {
    // Fall through to the safe landing page.
  }
  return "/trang-chu";
}

function cleanPayload(payload: PushPayload): PushPayload {
  return {
    title: String(payload.title || "VinhMath").slice(0, 90),
    body: String(payload.body || "Bạn có thông báo mới.").slice(0, 260),
    url: safeUrl(payload.url),
    tag: String(payload.tag || "vinhmath-notification").slice(0, 120),
    notificationId: payload.notificationId ? String(payload.notificationId).slice(0, 80) : undefined,
    kind: payload.kind ? String(payload.kind).slice(0, 40) : undefined,
  };
}

function configureVapid() {
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  const subject = env("VAPID_SUBJECT") || "mailto:admin@vinhmath.com";
  if (!publicKey || !privateKey) throw new Error("Web Push VAPID secrets are not configured");
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function publicVapidKey(): string {
  const key = env("VAPID_PUBLIC_KEY");
  if (!key) throw new Error("VAPID_PUBLIC_KEY is not configured");
  return key;
}

export async function sendPushToUser(admin: AdminClient, userId: string, payload: PushPayload) {
  configureVapid();
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("user_id", userId)
    .eq("enabled", true)
    .limit(20);
  if (error) throw error;

  const message = JSON.stringify(cleanPayload(payload));
  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const item of subscriptions || []) {
    try {
      await webpush.sendNotification({
        endpoint: item.endpoint,
        keys: { p256dh: item.p256dh, auth: item.auth },
      }, message, { TTL: 24 * 60 * 60, urgency: "normal" });
      sent += 1;
      await admin.from("push_subscriptions").update({
        failure_count: 0,
        last_error: null,
        last_success_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", item.id);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        removed += 1;
        await admin.from("push_subscriptions").delete().eq("id", item.id);
      } else {
        failed += 1;
        const failures = Number(item.failure_count || 0) + 1;
        await admin.from("push_subscriptions").update({
          failure_count: failures,
          enabled: failures < 5,
          last_error: String((error as Error).message || error).slice(0, 500),
          updated_at: new Date().toISOString(),
        }).eq("id", item.id);
      }
    }
  }
  return { sent, removed, failed, total: (subscriptions || []).length };
}
