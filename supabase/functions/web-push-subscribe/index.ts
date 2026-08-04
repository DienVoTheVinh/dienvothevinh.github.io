import { createClient } from "jsr:@supabase/supabase-js@2.95.0";
import { publicVapidKey, sendPushToUser } from "../_shared/web_push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://vinhmath.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function readEnvKey(primary: string, collection: string): string {
  const direct = Deno.env.get(primary);
  if (direct) return direct;
  try {
    const values = JSON.parse(Deno.env.get(collection) || "{}");
    return String(values.default || Object.values(values)[0] || "");
  } catch (_) {
    return "";
  }
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 20 || value.length > 4096) return false;
  try { return new URL(value).protocol === "https:"; } catch (_) { return false; }
}

function validKey(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishableKey = readEnvKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
    const secretKey = readEnvKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
    if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: "Server configuration is incomplete" }, 503);

    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Phiên đăng nhập không hợp lệ" }, 401);

    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "public-key") return json({ publicKey: publicVapidKey() });

    if (action === "status") {
      const { count, error } = await admin.from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("enabled", true);
      if (error) throw error;
      return json({ enabledDevices: count || 0 });
    }

    if (action === "unsubscribe") {
      if (!validEndpoint(body.endpoint)) return json({ error: "Endpoint không hợp lệ" }, 400);
      const { error } = await admin.from("push_subscriptions")
        .delete().eq("user_id", user.id).eq("endpoint", body.endpoint);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "test") {
      const result = await sendPushToUser(admin, user.id, {
        title: "VinhMath đã sẵn sàng",
        body: "Thông báo thử đã đến thiết bị của bạn.",
        url: "/trang-chu",
        tag: "vinhmath-push-test",
        kind: "test",
      });
      return json(result);
    }

    if (action !== "subscribe") return json({ error: "Tác vụ không hợp lệ" }, 400);

    const subscription = body.subscription || {};
    const keys = subscription.keys || {};
    if (!validEndpoint(subscription.endpoint) || !validKey(keys.p256dh) || !validKey(keys.auth)) {
      return json({ error: "Dữ liệu đăng ký thiết bị không hợp lệ" }, 400);
    }

    const { data: existing, error: existingError } = await admin.from("push_subscriptions")
      .select("id, user_id").eq("endpoint", subscription.endpoint).maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.user_id !== user.id) return json({ error: "Thiết bị đã thuộc tài khoản khác" }, 409);

    const device = body.device || {};
    const now = new Date().toISOString();
    const record = {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      expiration_time: Number.isFinite(Number(subscription.expirationTime)) ? Number(subscription.expirationTime) : null,
      device_label: String(device.label || "Thiết bị").slice(0, 80),
      timezone: String(device.timezone || "Asia/Ho_Chi_Minh").slice(0, 80),
      user_agent: String(device.userAgent || "").slice(0, 500),
      enabled: true,
      failure_count: 0,
      last_error: null,
      last_seen_at: now,
      updated_at: now,
    };
    const { error: upsertError } = await admin.from("push_subscriptions")
      .upsert(record, { onConflict: "endpoint" });
    if (upsertError) throw upsertError;
    return json({ ok: true });
  } catch (error) {
    console.error("web-push-subscribe", error);
    return json({ error: String((error as Error).message || error) }, 500);
  }
});
