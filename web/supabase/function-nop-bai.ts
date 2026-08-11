import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOAI_HOP_LE = new Set(["homework", "homework_bonus", "test"]);
const MAX_FILES = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 3;
const folderCache = new Map<string, string>();

function traJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function tenAnToan(value: unknown, fallback: string) {
  const text = String(value || fallback).replace(/[\u0000-\u001f/\\]/g, "-").trim();
  return (text || fallback).slice(0, 160);
}

async function fetchJson(url: string, init: RequestInit, moTa: string, timeoutMs: number, retryGet = 0): Promise<any> {
  let lan = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
      if (!response.ok) {
        const err = new Error(`${moTa}: HTTP ${response.status} - ${data.error?.message || data.message || raw || "không rõ lỗi"}`);
        (err as any).status = response.status;
        throw err;
      }
      return data;
    } catch (error) {
      const status = Number((error as any)?.status || 0);
      const coTheThuLai = (init.method || "GET") === "GET" && (status === 408 || status === 429 || status >= 500 || (error as Error)?.name === "AbortError");
      if (coTheThuLai && lan < retryGet) { lan++; continue; }
      if ((error as Error)?.name === "AbortError") throw new Error(`${moTa}: quá thời gian chờ máy chủ ngoài`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function googleToken(): Promise<string> {
  const data = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN") || "",
      grant_type: "refresh_token",
    }),
  }, "Không lấy được quyền truy cập Google Drive", 20000);
  if (!data.access_token) throw new Error("Google Drive không trả access token. Cần kết nối lại tài khoản Drive.");
  return data.access_token;
}

async function timHoacTaoThuMuc(token: string, ten: string, chaId?: string): Promise<string> {
  const safeName = tenAnToan(ten, "Chưa đặt tên");
  const cacheKey = `${chaId || "root"}/${safeName}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const q = "name='" + safeName.replace(/'/g, "\\'") + "' and mimeType='application/vnd.google-apps.folder' and trashed=false" + (chaId ? " and '" + chaId + "' in parents" : "");
  const found = await fetchJson("https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id)", {
    headers: { Authorization: "Bearer " + token },
  }, `Không tìm được thư mục “${safeName}”`, 20000, 1);
  if (found.files?.length) {
    folderCache.set(cacheKey, found.files[0].id);
    return found.files[0].id;
  }

  const created = await fetchJson("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: safeName, mimeType: "application/vnd.google-apps.folder", ...(chaId ? { parents: [chaId] } : {}) }),
  }, `Không tạo được thư mục “${safeName}”`, 25000);
  if (!created.id) throw new Error(`Google Drive không trả ID thư mục “${safeName}”.`);
  folderCache.set(cacheKey, created.id);
  return created.id;
}

async function xoaFileDrive(token: string, id: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    });
  } catch { /* dọn best-effort */ } finally { clearTimeout(timer); }
}

async function taiLenDrive(token: string, file: File, thuMucId: string, ten: string) {
  const fd = new FormData();
  fd.append("metadata", new Blob([JSON.stringify({ name: tenAnToan(ten, file.name), parents: [thuMucId] })], { type: "application/json" }));
  fd.append("file", file);
  const uploaded = await fetchJson("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd,
  }, `Không tải được tệp “${file.name}” lên Drive`, 55000);
  if (!uploaded.id) throw new Error(`Google Drive không trả ID cho tệp “${file.name}”.`);
  try {
    await fetchJson("https://www.googleapis.com/drive/v3/files/" + uploaded.id + "/permissions", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }, `Không cấp được quyền xem tệp “${file.name}”`, 20000);
  } catch (error) {
    await xoaFileDrive(token, uploaded.id);
    throw error;
  }
  return { id: uploaded.id, name: uploaded.name, link: uploaded.webViewLink };
}

async function taiNhieuFile(token: string, files: File[], thuMucId: string, prefix: string) {
  if (files.length > MAX_FILES) throw new Error(`Mỗi lần chỉ nộp tối đa ${MAX_FILES} tệp.`);
  let total = 0;
  for (const file of files) {
    if (!(file instanceof File) || !file.name) throw new Error("Danh sách tệp không hợp lệ.");
    if (file.size > MAX_FILE_BYTES) throw new Error(`Tệp “${file.name}” lớn hơn 15 MB.`);
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("Tổng dung lượng tệp lớn hơn 50 MB.");

  const results: any[] = new Array(files.length);
  const errors: Error[] = [];
  let nextIndex = 0;
  let stopped = false;
  async function worker() {
    while (!stopped) {
      const index = nextIndex++;
      if (index >= files.length) return;
      try {
        results[index] = await taiLenDrive(token, files[index], thuMucId, prefix + files[index].name);
      } catch (error) {
        errors.push(error as Error);
        stopped = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () => worker()));
  if (errors.length) {
    await Promise.all(results.filter(Boolean).map((item) => xoaFileDrive(token, item.id)));
    throw errors[0];
  }
  return results;
}

function thuMucLoaiTen(kind: string): string {
  if (kind === "test") return "Kiểm tra";
  if (kind === "homework_bonus") return "Bài tập thưởng thêm";
  return "Bài tập về nhà";
}

function coMang(value: unknown) { return Array.isArray(value) && value.length > 0; }

async function coQuyenQuanLyLop(svc: any, userId: string, role: string, classId: string | null) {
  if (role === "admin") return true;
  if (!classId) return false;
  const { data: lop } = await svc.from("classes").select("teacher_id, co_teacher_id").eq("id", classId).single();
  if (lop && (lop.teacher_id === userId || lop.co_teacher_id === userId)) return true;
  const { data: troGiang } = await svc.from("class_assistants").select("class_id").eq("class_id", classId).eq("assistant_id", userId).maybeSingle();
  return !!troGiang;
}

async function xacNhanHocSinhTrongLop(svc: any, studentId: string, classId: string | null) {
  if (!classId) return;
  const { data } = await svc.from("class_students").select("student_id").eq("class_id", classId).eq("student_id", studentId).maybeSingle();
  if (!data) throw new Error("Học sinh không thuộc lớp của bài đã chọn.");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return traJson({ error: "Phiên đăng nhập không hợp lệ." }, 401);
    const { data: prof } = await svc.from("profiles").select("username, full_name, role").eq("id", user.id).single();
    if (!prof) throw new Error("Không tìm thấy hồ sơ người dùng.");

    const form = await req.formData();
    const action = String(form.get("kind") || "nop");
    const phanloai = String(form.get("phanloai") || "");
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    if (action !== "xoa_cham" && !files.length) throw new Error("Chưa chọn tệp nào.");

    const token = await googleToken();
    const goc = action === "xoa_cham" ? "" : await timHoacTaoThuMuc(token, "VINHMATH NOP BAI");
    const ngay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

    if (action === "nop") {
      const lessonId = form.get("lesson_id") ? String(form.get("lesson_id")) : null;
      const examId = form.get("exam_id") ? String(form.get("exam_id")) : null;
      if ((!lessonId && !examId) || (lessonId && examId)) throw new Error("Phải chọn đúng một bài giảng hoặc một đề thi.");

      const isTeacher = ["admin", "teacher", "assistant"].includes(prof.role);
      const reqStudentId = form.get("student_id") ? String(form.get("student_id")) : null;
      if (reqStudentId && !isTeacher) throw new Error("Chỉ giáo viên mới được nộp hộ học sinh.");
      if (isTeacher && !reqStudentId) throw new Error("Thầy/cô chưa chọn học sinh để nộp hộ.");

      let targetStudentId = user.id;
      let targetProf: any = prof;
      if (reqStudentId) {
        targetStudentId = reqStudentId;
        const { data: sProf, error: sErr } = await svc.from("profiles").select("username, full_name, role").eq("id", targetStudentId).single();
        if (sErr || !sProf || sProf.role !== "student") throw new Error("Không tìm thấy hồ sơ học sinh hợp lệ.");
        targetProf = sProf;
      }

      let folderPath: string[] = [];
      let targetTitle = "";
      let kindVal = "test";
      let isLate = false;
      let classId: string | null = null;

      if (examId) {
        const { data: exam, error } = await svc.from("exams").select("title, class_id, classes(name, grade, is_specialized)").eq("id", examId).single();
        if (error || !exam) throw new Error("Không tìm thấy đề thi đã chọn.");
        classId = exam.class_id;
        kindVal = "test";
        targetTitle = exam.title || "Đề thi";
        const cl = exam.classes as any;
        const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Luyện đề chung";
        folderPath = [className, "Kiểm tra", `${targetProf.username} - ${targetProf.full_name}`, ngay];
      } else {
        if (!LOAI_HOP_LE.has(phanloai)) throw new Error("Chưa chọn rõ loại bài: BTVN, bài thưởng thêm hay bài kiểm tra.");
        const { data: lesson, error } = await svc.from("lessons").select("title, class_id, homework_text, homework_images, homework_latex_content, homework_document_id, homework2_text, homework2_images, homework2_latex_content, homework2_document_id, homework2_due, homework2_late_policy, test_document_id, test_latex_content, linked_exam_id, homework_due, test_deadline, homework_late_policy, test_late_policy, classes(name, grade, is_specialized)").eq("id", lessonId).single();
        if (error || !lesson) throw new Error("Không tìm thấy bài giảng đã chọn.");
        classId = lesson.class_id;
        kindVal = phanloai;
        targetTitle = lesson.title || "Bài giảng";
        const coBtvn = !!(lesson.homework_text || coMang(lesson.homework_images) || lesson.homework_latex_content || lesson.homework_document_id);
        const coBonus = !!(lesson.homework2_text || coMang(lesson.homework2_images) || lesson.homework2_latex_content || lesson.homework2_document_id);
        const coTest = !!(lesson.test_document_id || lesson.test_latex_content || lesson.linked_exam_id);
        if (kindVal === "homework" && !coBtvn) throw new Error("Bài giảng này chưa có BTVN bắt buộc.");
        if (kindVal === "homework_bonus" && !coBonus) throw new Error("Bài giảng này chưa có bài tập thưởng thêm.");
        if (kindVal === "test" && !coTest) throw new Error("Bài giảng này chưa có bài kiểm tra nhận bài nộp.");

        if (!isTeacher) {
          const { data: daCham } = await svc.from("submissions").select("id").eq("student_id", targetStudentId).eq("lesson_id", lessonId).eq("kind", kindVal).eq("status", "graded").limit(1);
          if (daCham?.length) throw new Error("Bài này đã được chấm nên em không nộp lại được nữa.");
        }
        let deadline: any = kindVal === "test" ? lesson.test_deadline : kindVal === "homework_bonus" ? lesson.homework2_due : lesson.homework_due;
        const policy = (kindVal === "test" ? lesson.test_late_policy : kindVal === "homework_bonus" ? lesson.homework2_late_policy : lesson.homework_late_policy) || "late";
        if (kindVal !== "homework_bonus") {
          const ovKind = kindVal === "test" ? "test" : "btvn";
          const { data: ov } = await svc.from("student_deadline_override").select("new_due").eq("student_id", targetStudentId).eq("lesson_id", lessonId).eq("kind", ovKind).maybeSingle();
          if (ov?.new_due) deadline = ov.new_due;
        }
        if (deadline && Date.now() > new Date(deadline).getTime()) {
          if (policy === "lock" && !isTeacher) throw new Error("Bài đã quá hạn và bị khóa. Em vui lòng liên hệ thầy/cô.");
          isLate = true;
        }
        const cl = lesson.classes as any;
        const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Chưa phân lớp";
        folderPath = [className, thuMucLoaiTen(kindVal), `${targetProf.username} - ${targetProf.full_name}`, ngay];
      }

      if (isTeacher && !(await coQuyenQuanLyLop(svc, user.id, prof.role, classId))) throw new Error("Thầy/cô không có quyền quản lý lớp của bài đã chọn.");
      await xacNhanHocSinhTrongLop(svc, targetStudentId, classId);
      const dryRun = String(form.get("dry_run") || "") === "1";
      if (dryRun && !isTeacher) throw new Error("Chỉ giáo viên mới được chạy kiểm tra tải tệp.");

      let currentParentId = goc;
      for (const folderName of folderPath) currentParentId = await timHoacTaoThuMuc(token, folderName, currentParentId);
      const ketQua = await taiNhieuFile(token, files, currentParentId, `[${targetTitle}] `);

      if (dryRun) {
        await Promise.all(ketQua.map((item) => xoaFileDrive(token, item.id)));
        return traJson({ ok: true, dry_run: true, uploaded_count: ketQua.length, kind: kindVal, target_title: targetTitle });
      }

      const { data: row, error } = await svc.from("submissions").insert({
        lesson_id: lessonId,
        exam_id: examId,
        student_id: targetStudentId,
        kind: kindVal,
        is_late: isLate,
        files: ketQua,
      }).select("id, submitted_at, kind, is_late").single();
      if (error) {
        await Promise.all(ketQua.map((item) => xoaFileDrive(token, item.id)));
        throw new Error("Không ghi được bài nộp vào sổ chấm: " + error.message);
      }
      return traJson({ ok: true, submission: row, files: ketQua, destination: { kind: kindVal, title: targetTitle, folder: thuMucLoaiTen(kindVal) } });
    }

    if (action !== "cham" && action !== "xoa_cham") throw new Error("Thao tác không hợp lệ.");
    if (!["admin", "teacher", "assistant"].includes(prof.role)) throw new Error("Chỉ giáo viên mới được sửa file chấm.");
    const subId = String(form.get("submission_id") || "");
    if (!subId) throw new Error("Thiếu mã bài nộp.");
    const { data: sub } = await svc.from("submissions").select("id, graded_files, student_id, lesson_id, exam_id, kind, profiles(username, full_name)").eq("id", subId).single();
    if (!sub) throw new Error("Không tìm thấy bài nộp.");
    const hs = sub.profiles as unknown as { username: string; full_name: string };

    let folderPath: string[] = [];
    let titlePrefix = "";
    let classId: string | null = null;
    if (sub.exam_id) {
      const { data: exam } = await svc.from("exams").select("title, class_id, classes(name, grade, is_specialized)").eq("id", sub.exam_id).single();
      if (!exam) throw new Error("Không tìm thấy đề thi của bài nộp.");
      classId = exam.class_id;
      const cl = exam.classes as any;
      const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Luyện đề chung";
      titlePrefix = `[${exam.title || "Đề thi"}] CHAM-`;
      folderPath = [className, "Kiểm tra", `${hs.username} - ${hs.full_name}`, ngay];
    } else if (sub.lesson_id) {
      const { data: lesson } = await svc.from("lessons").select("title, class_id, classes(name, grade, is_specialized)").eq("id", sub.lesson_id).single();
      if (!lesson) throw new Error("Không tìm thấy bài giảng của bài nộp.");
      classId = lesson.class_id;
      const cl = lesson.classes as any;
      const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Chưa phân lớp";
      titlePrefix = `[${lesson.title || "Bài giảng"}] CHAM-`;
      folderPath = [className, thuMucLoaiTen(sub.kind), `${hs.username} - ${hs.full_name}`, ngay];
    }
    if (!(await coQuyenQuanLyLop(svc, user.id, prof.role, classId))) throw new Error("Thầy/cô không có quyền chấm bài của lớp này.");

    if (action === "xoa_cham") {
      let requestedIds: string[] = [];
      try {
        const parsed = JSON.parse(String(form.get("file_ids") || "[]"));
        if (Array.isArray(parsed)) requestedIds = parsed.map((id) => String(id || "").trim()).filter(Boolean);
      } catch { throw new Error("Danh sách ảnh cần xóa không hợp lệ."); }
      requestedIds = [...new Set(requestedIds)];
      if (!requestedIds.length) throw new Error("Chưa chọn ảnh chấm cần xóa.");
      if (requestedIds.length > MAX_FILES) throw new Error(`Mỗi lần chỉ xóa tối đa ${MAX_FILES} tệp.`);

      const oldFiles = Array.isArray(sub.graded_files) ? (sub.graded_files as any[]) : [];
      const allowedIds = new Set(oldFiles.map((item) => String(item?.id || "")).filter(Boolean));
      const deleteIds = requestedIds.filter((id) => allowedIds.has(id));
      if (!deleteIds.length) throw new Error("Các ảnh đã chọn không còn trong bài chấm.");
      const deleteSet = new Set(deleteIds);
      const remaining = oldFiles.filter((item) => !deleteSet.has(String(item?.id || "")));
      const { error: updateError } = await svc.from("submissions").update({ graded_files: remaining }).eq("id", subId);
      if (updateError) throw new Error("Không cập nhật được danh sách ảnh chấm: " + updateError.message);
      await Promise.all(deleteIds.map((id) => xoaFileDrive(token, id)));
      return traJson({ ok: true, deleted_count: deleteIds.length, graded_files: remaining });
    }

    let currentParentId = goc;
    for (const folderName of folderPath) currentParentId = await timHoacTaoThuMuc(token, folderName, currentParentId);
    const ketQua = await taiNhieuFile(token, files, currentParentId, titlePrefix);
    const tatCa = [...((sub.graded_files as unknown[]) || []), ...ketQua];
    const { error } = await svc.from("submissions").update({ graded_files: tatCa }).eq("id", subId);
    if (error) {
      await Promise.all(ketQua.map((item) => xoaFileDrive(token, item.id)));
      throw new Error("Không cập nhật được file chấm: " + error.message);
    }
    return traJson({ ok: true, graded_files: tatCa });
  } catch (error) {
    console.error("nop-bai:", error);
    return traJson({ error: String((error as Error)?.message || error) }, 500);
  }
});
