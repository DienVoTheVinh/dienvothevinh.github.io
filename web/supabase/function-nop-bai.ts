// =====================================================================
// VINHMATH - TRAM NOP BAI (Edge Function "nop-bai")
// Nhan file tu web -> dua vao Google Drive cua thay theo cau truc
// VINHMATH NOP BAI/<hoc sinh>/<ngay>/ -> ghi so submissions.
// Bien moi truong can co (Secrets): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN (SUPABASE_* co san tu dong).
// =====================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function googleToken(): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Google token loi: " + JSON.stringify(j));
  return j.access_token;
}

async function timHoacTaoThuMuc(token: string, ten: string, chaId?: string): Promise<string> {
  const q = "name='" + ten.replace(/'/g, "\\'") + "' and mimeType='application/vnd.google-apps.folder' and trashed=false" + (chaId ? " and '" + chaId + "' in parents" : "");
  const r = await fetch("https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id)", { headers: { Authorization: "Bearer " + token } });
  const j = await r.json();
  if (j.files && j.files.length) return j.files[0].id;
  const c = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ name: ten, mimeType: "application/vnd.google-apps.folder" }, chaId ? { parents: [chaId] } : {})),
  });
  const cj = await c.json();
  if (!cj.id) throw new Error("Tao thu muc loi: " + JSON.stringify(cj));
  return cj.id;
}

async function taiLenDrive(token: string, file: File, thuMucId: string, ten: string) {
  const fd = new FormData();
  fd.append("metadata", new Blob([JSON.stringify({ name: ten, parents: [thuMucId] })], { type: "application/json" }));
  fd.append("file", file);
  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST", headers: { Authorization: "Bearer " + token }, body: fd,
  });
  const j = await r.json();
  if (!j.id) throw new Error("Tai len Drive loi: " + JSON.stringify(j));
  // Chia se "ai co link deu xem duoc" de HS xem lai bai cua minh
  await fetch("https://www.googleapis.com/drive/v3/files/" + j.id + "/permissions", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return { id: j.id, name: j.name, link: j.webViewLink };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // 1. Ai dang goi?
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Chua dang nhap" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: prof } = await svc.from("profiles").select("username, full_name, role").eq("id", user.id).single();
    if (!prof) throw new Error("Khong tim thay ho so");

    // 2. Doc du lieu form
    const form = await req.formData();
    const kind = String(form.get("kind") || "nop");
    const files = form.getAll("files") as File[];
    if (!files.length) throw new Error("Chua chon file nao");

    const token = await googleToken();
    const goc = await timHoacTaoThuMuc(token, "VINHMATH NOP BAI");
    const ngay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // gio VN

    // ----- HOC SINH NOP BAI -----
    if (kind === "nop") {
      const lessonId = String(form.get("lesson_id") || "");
      if (!lessonId) throw new Error("Thieu lesson_id");
      const tmHS = await timHoacTaoThuMuc(token, prof.username + " - " + prof.full_name, goc);
      const tmNgay = await timHoacTaoThuMuc(token, ngay, tmHS);
      const ketQua = [];
      for (const f of files) ketQua.push(await taiLenDrive(token, f, tmNgay, f.name));
      const { data: row, error } = await svc.from("submissions")
        .insert({ lesson_id: lessonId, student_id: user.id, files: ketQua })
        .select("id, submitted_at").single();
      if (error) throw new Error("Ghi so loi: " + error.message);
      return new Response(JSON.stringify({ ok: true, submission: row, files: ketQua }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ----- THAY TRA FILE CHAM -----
    if (!["admin", "teacher", "assistant"].includes(prof.role)) throw new Error("Chi giao vien duoc cham bai");
    const subId = String(form.get("submission_id") || "");
    if (!subId) throw new Error("Thieu submission_id");
    const { data: sub } = await svc.from("submissions")
      .select("id, graded_files, student_id, profiles(username, full_name)").eq("id", subId).single();
    if (!sub) throw new Error("Khong tim thay bai nop");
    const hs = sub.profiles as unknown as { username: string; full_name: string };
    const tmHS2 = await timHoacTaoThuMuc(token, hs.username + " - " + hs.full_name, goc);
    const tmNgay2 = await timHoacTaoThuMuc(token, ngay, tmHS2);
    const ketQua2 = [];
    for (const f of files) ketQua2.push(await taiLenDrive(token, f, tmNgay2, "CHAM-" + f.name));
    const tatCa = [...((sub.graded_files as unknown[]) || []), ...ketQua2];
    const { error: e2 } = await svc.from("submissions").update({ graded_files: tatCa }).eq("id", subId);
    if (e2) throw new Error("Cap nhat loi: " + e2.message);
    return new Response(JSON.stringify({ ok: true, graded_files: tatCa }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
