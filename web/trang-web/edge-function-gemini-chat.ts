// ============================================================
// VINHMATH — Edge Function: gemini-chat
// Giữ Gemini API Key PHÍA MÁY CHỦ (secret). Trình duyệt học sinh
// KHÔNG bao giờ thấy key. Học sinh chỉ gửi câu hỏi qua hàm này.
//
// Deploy: Supabase Dashboard → Edge Functions → gemini-chat → Code → dán → Deploy.
// Secret cần đặt: GEMINI_API_KEY = <key của thầy>
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    // 1) Bắt buộc đăng nhập
    const authHeader = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Chua dang nhap" }, 401);

    // 2) Tính năng phải đang bật
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "ai_enabled").maybeSingle();
    if (!setting || setting.value !== "true") {
      return json({ error: "Tro ly AI hien dang tat." }, 403);
    }

    // 3) Lấy nội dung hội thoại + system prompt từ client
    const body = await req.json().catch(() => ({}));
    let contents = Array.isArray(body?.contents) ? body.contents : null;
    if (!contents) {
      const q = String(body?.question || "").slice(0, 4000).trim();
      if (!q) return json({ error: "Cau hoi trong." }, 400);
      contents = [{ role: "user", parts: [{ text: q }] }];
    }
    if (contents.length > 30) contents = contents.slice(-30); // chống lạm dụng
    const systemPrompt = String(
      body?.systemPrompt ||
        "Ban la tro ly hoc Toan than thien cua lop Thay Vinh. Tra loi ngan gon, de hieu, bang tieng Viet, khuyen khich hoc sinh tu duy.",
    ).slice(0, 4000);

    // 4) Gọi Gemini bằng KEY phía máy chủ
    const KEY = Deno.env.get("GEMINI_API_KEY");
    if (!KEY) return json({ error: "May chu chua cau hinh GEMINI_API_KEY." }, 500);

    const model = "gemini-2.5-flash";
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`;

    const gRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
    });

    const gData = await gRes.json();
    const reply = gData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Xin loi em, hien chua tra loi duoc. Em thu lai sau nhe.";

    return json({ reply });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
