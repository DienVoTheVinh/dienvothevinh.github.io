import { createClient } from "jsr:@supabase/supabase-js@2.95.0";
import { sendPushToUser } from "../_shared/web_push.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function readSecretKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return String(values.default || Object.values(values)[0] || "");
  } catch (_) {
    return "";
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i] ^ b[i];
  return result === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const expected = (Deno.env.get("WEB_PUSH_WEBHOOK_SECRET") || "").trim();
    const received = (req.headers.get("x-webhook-secret") || "").trim();
    if (!expected || !received || !constantTimeEqual(expected, received)) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.type !== "INSERT" || body.schema !== "public" || body.table !== "notifications" || !body.record) {
      return json({ error: "Unsupported webhook payload" }, 400);
    }
    const record = body.record;
    if (!record.user_id || !record.title) return json({ error: "Notification record is incomplete" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const secretKey = readSecretKey();
    if (!supabaseUrl || !secretKey) return json({ error: "Server configuration is incomplete" }, 503);
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await sendPushToUser(admin, String(record.user_id), {
      title: String(record.title),
      body: record.body ? String(record.body) : undefined,
      url: record.link ? String(record.link) : "/trang-chu",
      tag: record.id ? "vinhmath-notification-" + String(record.id) : "vinhmath-notification",
      notificationId: record.id ? String(record.id) : undefined,
      kind: record.kind ? String(record.kind) : "info",
    });
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("web-push-dispatch", error);
    return json({ error: String((error as Error).message || error) }, 500);
  }
});
