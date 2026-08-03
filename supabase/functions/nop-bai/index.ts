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
  await fetch("https://www.googleapis.com/drive/v3/files/" + j.id + "/permissions", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return { id: j.id, name: j.name, link: j.webViewLink };
}

function thuMucLoaiTen(kind: string): string {
  if (kind === "test") return "Kiểm tra";
  if (kind === "homework_bonus") return "Bài tập thưởng thêm";
  return "Bài tập về nhà";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Chua dang nhap" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const { data: prof } = await svc.from("profiles").select("username, full_name, role").eq("id", user.id).single();
    if (!prof) throw new Error("Khong tim thay ho so");

    const form = await req.formData();
    const kind = String(form.get("kind") || "nop");
    const phanloai = String(form.get("phanloai") || "");
    const files = form.getAll("files") as File[];
    if (!files.length) throw new Error("Chua chon file nao");

    const token = await googleToken();
    const goc = await timHoacTaoThuMuc(token, "VINHMATH NOP BAI");
    const ngay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

    if (kind === "nop") {
      const lessonId = form.get("lesson_id") ? String(form.get("lesson_id")) : null;
      const examId = form.get("exam_id") ? String(form.get("exam_id")) : null;
      if (!lessonId && !examId) throw new Error("Thieu lesson_id hoac exam_id");

      let targetStudentId = user.id;
      let targetProf = prof;
      const isTeacher = ["admin", "teacher", "assistant"].includes(prof.role);
      const reqStudentId = form.get("student_id") ? String(form.get("student_id")) : null;

      if (isTeacher && reqStudentId) {
        targetStudentId = reqStudentId;
        const { data: sProf, error: sErr } = await svc.from("profiles").select("username, full_name, role").eq("id", targetStudentId).single();
        if (sErr || !sProf) throw new Error("Khong tim thay ho so hoc sinh: " + (sErr?.message || ""));
        targetProf = sProf;
      }

      let folderPath: string[] = [];
      let examTitle = "";
      let lessonTitle = "";
      let kindVal = "homework";
      let isLate = false;
      if (examId) {
        const { data: exam, error: errE } = await svc.from("exams").select("title, class_id, classes(name, grade, is_specialized)").eq("id", examId).single();
        if (errE || !exam) throw new Error("Khong tim thay de thi: " + (errE?.message || ""));
        const cl = exam.classes as any;
        const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? 'Chuyên' : 'Đại trà'})` : "Luyện đề chung";
        examTitle = exam.title || "Đề thi";
        kindVal = "test";
        folderPath = [className, "Kiểm tra", targetProf.username + " - " + targetProf.full_name, ngay];
      } else if (lessonId) {
        const { data: lesson, error: errL } = await svc.from("lessons").select("title, class_id, homework_text, homework_images, homework_latex_content, homework_document_id, homework2_text, homework2_images, homework2_latex_content, homework2_document_id, homework2_due, homework2_late_policy, test_document_id, test_latex_content, homework_due, test_deadline, homework_late_policy, test_late_policy, classes(name, grade, is_specialized)").eq("id", lessonId).single();
        if (errL || !lesson) throw new Error("Khong tim thay bai hoc: " + (errL?.message || ""));
        const cl = lesson.classes as any;
        const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? 'Chuyên' : 'Đại trà'})` : "Chưa phân lớp";
        lessonTitle = lesson.title || "Bài giảng";
        const coBtvn = !!((lesson as any).homework_text || (lesson as any).homework_images || (lesson as any).homework_latex_content || (lesson as any).homework_document_id);
        const coBonus = !!((lesson as any).homework2_text || (lesson as any).homework2_images || (lesson as any).homework2_latex_content || (lesson as any).homework2_document_id);
        const coTest = !!((lesson as any).test_document_id || (lesson as any).test_latex_content);
        if (phanloai === "homework" || phanloai === "homework_bonus" || phanloai === "test") kindVal = phanloai;
        else if (coBtvn && !coTest) kindVal = "homework";
        else if (coTest && !coBtvn) kindVal = "test";
        else kindVal = "homework";
        if (!isTeacher) {
          const { data: daCham } = await svc.from("submissions").select("id").eq("student_id", targetStudentId).eq("lesson_id", lessonId).eq("kind", kindVal).eq("status", "graded").limit(1);
          if (daCham && daCham.length) throw new Error("Bài này đã được chấm nên em không nộp lại được nữa. Em xem điểm & nhận xét ở mục Kết quả nhé!");
        }
        let deadline: any;
        let policy: string;
        if (kindVal === "test") { deadline = (lesson as any).test_deadline; policy = (lesson as any).test_late_policy || "late"; }
        else if (kindVal === "homework_bonus") { deadline = (lesson as any).homework2_due; policy = (lesson as any).homework2_late_policy || "late"; }
        else { deadline = (lesson as any).homework_due; policy = (lesson as any).homework_late_policy || "late"; }
        if (kindVal !== "homework_bonus") {
          const ovKind = kindVal === "test" ? "test" : "btvn";
          const { data: ov } = await svc.from("student_deadline_override").select("new_due").eq("student_id", targetStudentId).eq("lesson_id", lessonId).eq("kind", ovKind).maybeSingle();
          if (ov && (ov as any).new_due) deadline = (ov as any).new_due;
        }
        if (deadline && Date.now() > new Date(deadline).getTime()) {
          if (policy === "lock" && !isTeacher) throw new Error("Đã quá hạn nộp bài nên hệ thống đã khoá. Em vui lòng liên hệ thầy/cô.");
          isLate = true;
        }
        folderPath = [className, thuMucLoaiTen(kindVal), targetProf.username + " - " + targetProf.full_name, ngay];
      }

      let currentParentId = goc;
      for (const folderName of folderPath) {
        currentParentId = await timHoacTaoThuMuc(token, folderName, currentParentId);
      }

      const ketQua = [];
      const titlePrefix = examId ? `[${examTitle}] ` : `[${lessonTitle}] `;
      for (const f of files) {
        ketQua.push(await taiLenDrive(token, f, currentParentId, titlePrefix + f.name));
      }

      const { data: row, error } = await svc.from("submissions")
        .insert({ lesson_id: lessonId, exam_id: examId, student_id: targetStudentId, kind: kindVal, is_late: isLate, files: ketQua })
        .select("id, submitted_at").single();
      if (error) throw new Error("Ghi so loi: " + error.message);
      return new Response(JSON.stringify({ ok: true, submission: row, files: ketQua, is_late: isLate }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (!["admin", "teacher", "assistant"].includes(prof.role)) throw new Error("Chi giao vien duoc cham bai");
    const subId = String(form.get("submission_id") || "");
    if (!subId) throw new Error("Thieu submission_id");
    const { data: sub } = await svc.from("submissions")
      .select("id, graded_files, student_id, lesson_id, exam_id, kind, profiles(username, full_name)").eq("id", subId).single();
    if (!sub) throw new Error("Khong tim thay bai nop");
    const hs = sub.profiles as unknown as { username: string; full_name: string };

    let folderPath: string[] = [];
    let titlePrefix = "";
    if (sub.exam_id) {
      const { data: exam, error: errE } = await svc.from("exams").select("title, class_id, classes(name, grade, is_specialized)").eq("id", sub.exam_id).single();
      if (errE || !exam) throw new Error("Khong tim thay de thi: " + (errE?.message || ""));
      const cl = exam.classes as any;
      const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? 'Chuyên' : 'Đại trà'})` : "Luyện đề chung";
      const examTitle = exam.title || "Đề thi";
      titlePrefix = `[${examTitle}] `;
      folderPath = [className, "Kiểm tra", hs.username + " - " + hs.full_name, ngay];
    } else if (sub.lesson_id) {
      const { data: lesson, error: errL } = await svc.from("lessons").select("title, class_id, classes(name, grade, is_specialized)").eq("id", sub.lesson_id).single();
      if (errL || !lesson) throw new Error("Khong tim thay bai hoc: " + (errL?.message || ""));
      const cl = lesson.classes as any;
      const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? 'Chuyên' : 'Đại trà'})` : "Chưa phân lớp";
      const lessonTitle = lesson.title || "Bài giảng";
      titlePrefix = `[${lessonTitle}] `;
      folderPath = [className, thuMucLoaiTen((sub as any).kind), hs.username + " - " + hs.full_name, ngay];
    } else {
      folderPath = [hs.username + " - " + hs.full_name, ngay];
    }

    let currentParentId = goc;
    for (const folderName of folderPath) {
      currentParentId = await timHoacTaoThuMuc(token, folderName, currentParentId);
    }

    const ketQua2 = [];
    for (const f of files) {
      ketQua2.push(await taiLenDrive(token, f, currentParentId, titlePrefix + "CHAM-" + f.name));
    }
    const tatCa = [...((sub.graded_files as unknown[]) || []), ...ketQua2];
    const { error: e2 } = await svc.from("submissions").update({ graded_files: tatCa }).eq("id", subId);
    if (e2) throw new Error("Cap nhat loi: " + e2.message);
    return new Response(JSON.stringify({ ok: true, graded_files: tatCa }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
