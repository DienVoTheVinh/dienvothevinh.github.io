import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.95.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const DOMAIN: Record<string, string> = {
  hs: "hs.vinhmath.com", ph: "ph.vinhmath.com", gv: "gv.vinhmath.com", tg: "tg.vinhmath.com",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{0,62}$/;
const STUDENT_SUFFIX_RE = /^hs[a-z0-9]{2,20}$/;
const TEACHER_SUFFIX_RE = /^gv[a-z0-9]{2,20}$/;

// This Edge Function intentionally uses the generated-at-runtime public schema.
// Keeping the service client open here avoids a false `never` schema when Deno
// checks the generic createClient factory without checked-in Database types.
// Authorization still comes from the service key plus the explicit admin gate.
type EdgeServiceClient = any;
type FullSiteActor = {
  id: string;
  username: string;
  memberRole: "manager" | "student";
  profileRole: "teacher" | "student";
  suffix: string;
};
type AuthSnapshot = FullSiteActor & {
  oldEmail: string;
  targetEmail: string;
  appMetadata: Record<string, unknown>;
  userMetadata: Record<string, unknown>;
};
type PortalMemberRow = {
  user_id: string;
  member_role: string;
  portal_only: boolean;
  is_primary: boolean;
};
type ClassRosterRow = { student_id: string };
type StudentProfileRow = { id: string; username: string; role: string };

function copyMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function compactLogin(email: string): string {
  return email.toLowerCase().replace(/\.vinhmath\.com$/, "");
}

async function rollbackAuthEmails(svc: EdgeServiceClient, changed: AuthSnapshot[]) {
  const failedUserIds: string[] = [];
  for (const actor of [...changed].reverse()) {
    const { error } = await svc.auth.admin.updateUserById(actor.id, {
      email: actor.oldEmail,
      email_confirm: true,
      app_metadata: { ...actor.appMetadata },
      user_metadata: { ...actor.userMetadata },
    });
    if (error) failedUserIds.push(actor.id);
  }
  return { ok: failedUserIds.length === 0, failedUserIds };
}

async function fullSiteTenantState(
  svc: EdgeServiceClient,
  portalId: string,
  teacherId: string,
  studentIds: string[],
) {
  const cohortIds = [teacherId, ...studentIds];
  const [portalResult, memberResult] = await Promise.all([
    svc.from("exam_portals").select("id,is_active,experience_mode").eq("id", portalId).maybeSingle(),
    svc.from("exam_portal_members")
      .select("user_id,member_role,portal_only,is_primary")
      .eq("portal_id", portalId)
      .in("user_id", cohortIds),
  ]);
  if (portalResult.error || memberResult.error) return { known: false, complete: false };
  const memberRows = (memberResult.data || []) as PortalMemberRow[];
  const members = new Map<string, PortalMemberRow>(
    memberRows.map((row) => [String(row.user_id), row]),
  );
  const teacher = members.get(teacherId);
  const studentsOk = studentIds.every((id) => {
    const member = members.get(id);
    return member?.member_role === "student" && member.portal_only === false && member.is_primary === true;
  });
  return {
    known: true,
    complete: portalResult.data?.is_active === true && portalResult.data?.experience_mode === "full_site" &&
      teacher?.member_role === "manager" && teacher.portal_only === false && teacher.is_primary === true && studentsOk,
  };
}

async function migrateFullSiteTenant(
  svc: EdgeServiceClient,
  body: Record<string, unknown>,
): Promise<Response> {
  const portalId = String(body.tenantId || "");
  const teacherId = String(body.teacherId || "");
  const classId = String(body.classId || "");
  const dryRun = body.dryRun === true;
  if (![portalId, teacherId, classId].every((value) => UUID_RE.test(value))) {
    return jsonRes({ error: "Tenant, giao vien hoac lop hoc khong hop le" }, 400);
  }

  const { data: portal, error: portalError } = await svc.from("exam_portals")
    .select("id,slug,login_suffix,teacher_login_suffix,is_active,experience_mode")
    .eq("id", portalId).maybeSingle();
  if (portalError) return jsonRes({ error: "Khong doc duoc cau hinh tenant day du" }, 409);
  if (!portal) return jsonRes({ error: "Khong tim thay tenant" }, 404);
  if (portal.experience_mode !== "full_site") {
    return jsonRes({ error: "Tenant khong o che do toan bo VinhMath" }, 409);
  }
  const studentSuffix = String(portal.login_suffix || "");
  const teacherSuffix = String(portal.teacher_login_suffix || "");
  if (!STUDENT_SUFFIX_RE.test(studentSuffix) || studentSuffix === "hs" ||
      !TEACHER_SUFFIX_RE.test(teacherSuffix) || teacherSuffix === "gv") {
    return jsonRes({ error: "Hau to dang nhap tenant khong hop le" }, 409);
  }

  const [teacherResult, classResult, rosterResult] = await Promise.all([
    svc.from("profiles").select("id,username,role").eq("id", teacherId).maybeSingle(),
    svc.from("classes").select("id,teacher_id").eq("id", classId).maybeSingle(),
    svc.from("class_students").select("student_id").eq("class_id", classId),
  ]);
  if (teacherResult.error || classResult.error || rosterResult.error) {
    return jsonRes({ error: "Khong kiem tra duoc giao vien va danh sach lop" }, 500);
  }
  if (!teacherResult.data || teacherResult.data.role !== "teacher") {
    return jsonRes({ error: "Tai khoan giao vien khong hop le" }, 409);
  }
  if (!classResult.data || classResult.data.teacher_id !== teacherId) {
    return jsonRes({ error: "Lop hoc khong thuoc giao vien da chon" }, 409);
  }
  const rosterRows = (rosterResult.data || []) as ClassRosterRow[];
  const studentIds: string[] = [...new Set<string>(rosterRows.map((row) => String(row.student_id || "")))]
    .filter((id) => UUID_RE.test(id)).sort();
  if (studentIds.length !== rosterRows.length) {
    return jsonRes({ error: "Danh sach lop co tai khoan khong hop le hoac trung lap" }, 409);
  }
  if (studentIds.length > 1000) return jsonRes({ error: "Danh sach lop vuot qua gioi han chuyen an toan" }, 409);
  const { data: studentProfiles, error: studentProfileError } = studentIds.length
    ? await svc.from("profiles").select("id,username,role").in("id", studentIds)
    : { data: [], error: null };
  if (studentProfileError) return jsonRes({ error: "Khong kiem tra duoc tai khoan hoc sinh" }, 500);
  const typedStudentProfiles = (studentProfiles || []) as StudentProfileRow[];
  if (typedStudentProfiles.length !== studentIds.length ||
      typedStudentProfiles.some((profile) => profile.role !== "student")) {
    return jsonRes({ error: "Danh sach lop co tai khoan khong phai hoc sinh" }, 409);
  }

  const actors: FullSiteActor[] = [{
    id: teacherId,
    username: String(teacherResult.data.username || "").trim().toLowerCase(),
    memberRole: "manager" as const,
    profileRole: "teacher" as const,
    suffix: teacherSuffix,
  }, ...typedStudentProfiles.map((profile) => ({
    id: String(profile.id),
    username: String(profile.username || "").trim().toLowerCase(),
    memberRole: "student" as const,
    profileRole: "student" as const,
    suffix: studentSuffix,
  }))].sort((a, b) => a.memberRole === b.memberRole ? a.username.localeCompare(b.username) : a.memberRole === "manager" ? -1 : 1);
  if (actors.some((actor) => !USERNAME_RE.test(actor.username))) {
    return jsonRes({ error: "Co ten dang nhap khong the chuyen sang tenant" }, 409);
  }
  const targetEmails = actors.map((actor) => `${actor.username}@${actor.suffix}.vinhmath.com`);
  if (new Set(targetEmails).size !== targetEmails.length) {
    return jsonRes({ error: "Danh sach co ten dang nhap tenant bi trung" }, 409);
  }
  if (portal.is_active === true) {
    const existingState = await fullSiteTenantState(svc, portalId, teacherId, studentIds);
    if (!existingState.known) return jsonRes({ error: "Khong kiem tra duoc trang thai tenant dang hoat dong" }, 500);
    if (!existingState.complete) {
      return jsonRes({ error: "Tenant phai o trang thai cho hoac da hoan tat dung nhom tai khoan" }, 409);
    }
  }

  const authResults = await Promise.all(actors.map(async (actor) => ({
    actor,
    result: await svc.auth.admin.getUserById(actor.id),
  })));
  const snapshots: AuthSnapshot[] = [];
  for (const item of authResults) {
    const authUser = item.result.data?.user;
    if (item.result.error || !authUser?.email) {
      return jsonRes({ error: "Khong tim thay Auth user trong danh sach chuyen" }, 409);
    }
    snapshots.push({
      ...item.actor,
      oldEmail: authUser.email.toLowerCase(),
      targetEmail: `${item.actor.username}@${item.actor.suffix}.vinhmath.com`,
      appMetadata: copyMetadata(authUser.app_metadata),
      userMetadata: copyMetadata(authUser.user_metadata),
    });
  }

  const targetOwners = new Map<string, string>();
  for (let page = 1; page <= 10000; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return jsonRes({ error: "Khong kiem tra duoc trung email Auth" }, 500);
    const users = data?.users || [];
    for (const authUser of users) {
      const email = String(authUser.email || "").toLowerCase();
      if (targetEmails.includes(email)) targetOwners.set(email, authUser.id);
    }
    if (users.length < 1000) break;
    if (page === 10000) return jsonRes({ error: "Danh sach Auth qua lon de kiem tra an toan" }, 503);
  }
  const collision = snapshots.find((actor) => {
    const owner = targetOwners.get(actor.targetEmail);
    return owner && owner !== actor.id;
  });
  if (collision) return jsonRes({ error: "Email tenant dich da duoc su dung" }, 409);

  const loginMapping = snapshots.map((actor) => ({
    userId: actor.id,
    role: actor.profileRole,
    from: compactLogin(actor.oldEmail),
    to: compactLogin(actor.targetEmail),
    unchanged: actor.oldEmail === actor.targetEmail,
  }));
  const preflight = {
    tenantId: portal.id,
    tenantSlug: portal.slug,
    classId,
    teacherId,
    studentCount: studentIds.length,
    willActivate: portal.is_active !== true,
    loginMapping,
  };
  if (dryRun) return jsonRes({ ok: true, type: "full_site_tenant_migrate", dryRun: true, preflight });

  const changed: AuthSnapshot[] = [];
  for (const actor of snapshots) {
    if (actor.oldEmail === actor.targetEmail) continue;
    const { data, error } = await svc.auth.admin.updateUserById(actor.id, {
      email: actor.targetEmail,
      email_confirm: true,
      app_metadata: { ...actor.appMetadata },
      user_metadata: { ...actor.userMetadata },
    });
    if (error || data.user?.email?.toLowerCase() !== actor.targetEmail) {
      // A transport error can arrive after GoTrue committed the rename. Resolve
      // that ambiguity before compensating, otherwise the current actor could
      // be left on the tenant suffix while the earlier actors are reverted.
      const observed = await svc.auth.admin.getUserById(actor.id);
      const observedEmail = observed.data?.user?.email?.toLowerCase();
      if (!observed.error && observedEmail === actor.targetEmail) changed.push(actor);
      else if (observed.error || (observedEmail !== actor.oldEmail && observedEmail !== actor.targetEmail)) {
        const rollback = await rollbackAuthEmails(svc, changed);
        return jsonRes({
          error: "Chua xac dinh duoc trang thai doi email Auth; hay thu lai cung yeu cau",
          retryable: true,
          rollbackKnownOk: rollback.ok,
          rollbackFailedUserIds: rollback.failedUserIds,
        }, 503);
      }
      const rollback = await rollbackAuthEmails(svc, changed);
      return jsonRes({
        error: "Khong chuyen duoc tat ca email Auth",
        rollbackOk: rollback.ok,
        rollbackFailedUserIds: rollback.failedUserIds,
      }, rollback.ok ? 409 : 500);
    }
    changed.push(actor);
  }

  const { data: finalization, error: finalizationError } = await svc.rpc(
    "vm_admin_finalize_full_site_tenant_migration",
    { p_portal_id: portalId, p_teacher_id: teacherId, p_student_ids: studentIds },
  );
  if (finalizationError) {
    const state = await fullSiteTenantState(svc, portalId, teacherId, studentIds);
    if (state.known && state.complete) {
      return jsonRes({ ok: true, type: "full_site_tenant_migrate", dryRun: false, idempotentRecovery: true, preflight });
    }
    if (!state.known) {
      return jsonRes({
        error: "Chua xac dinh duoc trang thai giao dich tenant; hay thu lai cung yeu cau",
        retryable: true,
      }, 503);
    }
    const rollback = await rollbackAuthEmails(svc, changed);
    return jsonRes({
      error: "Khong kich hoat duoc tenant; da hoan tac email Auth",
      rollbackOk: rollback.ok,
      rollbackFailedUserIds: rollback.failedUserIds,
    }, rollback.ok ? 500 : 503);
  }
  return jsonRes({
    ok: true,
    type: "full_site_tenant_migrate",
    dryRun: false,
    preflight,
    finalization,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonRes({ error: "Chua dang nhap" }, 401);
    const { data: prof } = await svc.from("profiles").select("role").eq("id", user.id).single();
    if (!prof) return jsonRes({ error: "Khong tim thay ho so" }, 403);

    const body = await req.json();
    const type = String(body.type || "hs_ph");
    const allowedTypes = new Set(["hs_ph", "gv", "tg", "portal_hs", "portal_gv", "reset_password", "full_site_tenant_migrate"]);
    if (!allowedTypes.has(type)) return jsonRes({ error: "Loai tai khoan khong hop le" }, 400);
    const fullName = String(body.fullName || "").trim();
    const baseU = String(body.username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const password = String(body.password || "");
    const password2 = String(body.password2 || password);

    if (type === "full_site_tenant_migrate") {
      if (prof.role !== "admin") return jsonRes({ error: "Chi Quan tri duoc chuyen tenant day du" }, 403);
      return await migrateFullSiteTenant(svc, body);
    }

    if (type === "reset_password") {
      if (prof.role !== "admin") return jsonRes({ error: "Chi Quan tri duoc cap lai mat khau" }, 403);
      const targetUserId = String(body.targetUserId || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
        return jsonRes({ error: "Tai khoan dich khong hop le" }, 400);
      }
      if (targetUserId === user.id) return jsonRes({ error: "Khong cap lai mat khau cua chinh minh tai day" }, 400);
      if (password.length < 8) return jsonRes({ error: "Mat khau moi toi thieu 8 ky tu" }, 400);
      const { data: target } = await svc.from("profiles").select("id").eq("id", targetUserId).maybeSingle();
      if (!target) return jsonRes({ error: "Khong tim thay tai khoan" }, 404);
      const { error: updateError } = await svc.auth.admin.updateUserById(targetUserId, { password });
      if (updateError) return jsonRes({ error: "Khong cap lai duoc mat khau" }, 500);
      return jsonRes({ ok: true, type });
    }

    // Portal students are admin-only. Partner managers deliberately do not get
    // the broad teacher role or access to this service-role operation.
    if (["gv", "tg", "portal_hs", "portal_gv"].includes(type)) {
      if (prof.role !== "admin") return jsonRes({ error: "Chi Quan tri duoc tao loai tai khoan nay" }, 403);
    } else if (!["admin", "teacher"].includes(prof.role)) {
      return jsonRes({ error: "Chi Quan tri / Giao vien duoc tao tai khoan" }, 403);
    }

    if (!fullName) return jsonRes({ error: "Thieu ho ten" }, 400);
    if (!baseU) return jsonRes({ error: "Ten dang nhap khong hop le" }, 400);
    if (password.length < 8 || password2.length < 8) return jsonRes({ error: "Mat khau toi thieu 8 ky tu" }, 400);

    async function timU(needPh: boolean): Promise<string | null> {
      for (let i = 1; i <= 60; i++) {
        const cand = i === 1 ? baseU : baseU + i;
        const names = needPh ? [cand, cand + "_ph"] : [cand];
        const { data: taken } = await svc.from("profiles").select("username").in("username", names);
        if (!taken || taken.length === 0) return cand;
      }
      return null;
    }

    if (type === "portal_hs" || type === "portal_gv") {
      const portalId = String(body.portalId || "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(portalId)) {
        return jsonRes({ error: "Portal khong hop le" }, 400);
      }
      const { data: portal } = await svc.from("exam_portals").select("id,slug,login_suffix,teacher_login_suffix,is_active,experience_mode").eq("id", portalId).maybeSingle();
      if (!portal || !portal.is_active || portal.experience_mode !== "exam_only") {
        return jsonRes({ error: "Portal thi khong ton tai hoac dang tam dung" }, 404);
      }
      const u = await timU(false);
      if (!u) return jsonRes({ error: "Khong tao duoc ten dang nhap duy nhat" }, 409);
      const isManager = type === "portal_gv";
      const suffix = isManager ? portal.teacher_login_suffix : portal.login_suffix;
      if (!new RegExp(isManager ? "^gv[a-z0-9]{2,20}$" : "^hs[a-z0-9]{2,20}$").test(String(suffix || ""))) {
        return jsonRes({ error: "Hau to portal khong hop le" }, 409);
      }
      const email = `${u}@${suffix}.vinhmath.com`;
      const { data: acc, error: accErr } = await svc.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { vinhmath_role: "student" },
      });
      if (accErr || !acc?.user) return jsonRes({ error: "Khong tao duoc tai khoan portal" }, 500);
      // Portal managers stay profile.role=student on purpose. Their manager
      // permission comes only from exam_portal_members, preventing broad teacher
      // access to the main VinhMath tenant.
      const profileResult = await svc.from("profiles").update({ full_name: fullName, username: u, role: "student" }).eq("id", acc.user.id);
      const memberResult = await svc.from("exam_portal_members").insert({
        portal_id: portal.id, user_id: acc.user.id, member_role: isManager ? "manager" : "student", portal_only: true,
      });
      if (profileResult.error || memberResult.error) {
        await svc.auth.admin.deleteUser(acc.user.id).catch(() => {});
        return jsonRes({ error: "Khong gan duoc tai khoan vao portal" }, 500);
      }
      return jsonRes({ ok: true, type, login: `${u}@${suffix}`, memberRole: isManager ? "manager" : "student" });
    }

    if (type === "hs_ph") {
      const u = await timU(true);
      if (!u) return jsonRes({ error: "Khong tao duoc ten dang nhap duy nhat" }, 409);
      const hsEmail = u + "@" + DOMAIN.hs;
      const phEmail = u + "@" + DOMAIN.ph;
      const { data: hs, error: hsErr } = await svc.auth.admin.createUser({
        email: hsEmail, password, email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { vinhmath_role: "student" },
      });
      if (hsErr || !hs?.user) return jsonRes({ error: "Tao TK hoc sinh loi: " + (hsErr?.message || "unknown") }, 500);
      const { data: ph, error: phErr } = await svc.auth.admin.createUser({
        email: phEmail, password: password2, email_confirm: true,
        user_metadata: { full_name: "Phụ huynh " + fullName },
        app_metadata: { vinhmath_role: "parent" },
      });
      if (phErr || !ph?.user) {
        await svc.auth.admin.deleteUser(hs.user.id).catch(() => {});
        return jsonRes({ error: "Tao TK phu huynh loi: " + (phErr?.message || "unknown") }, 500);
      }
      await svc.from("profiles").update({ full_name: "Phụ huynh " + fullName }).eq("id", ph.user.id);
      await svc.from("profiles").update({ full_name: fullName, parent_id: ph.user.id }).eq("id", hs.user.id);
      return jsonRes({ ok: true, type,
        student: { id: hs.user.id, login: u + "@hs.vinhmath", email: hsEmail },
        parent: { id: ph.user.id, login: u + "@ph.vinhmath", email: phEmail },
      });
    }

    const key = type === "gv" ? "gv" : "tg";
    const u = await timU(false);
    if (!u) return jsonRes({ error: "Khong tao duoc ten dang nhap duy nhat" }, 409);
    const email = u + "@" + DOMAIN[key];
    const accountRole = type === "gv" ? "teacher" : "assistant";
    const { data: acc, error: accErr } = await svc.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { vinhmath_role: accountRole },
    });
    if (accErr || !acc?.user) return jsonRes({ error: "Tao TK loi: " + (accErr?.message || "unknown") }, 500);
    await svc.from("profiles").update({ full_name: fullName }).eq("id", acc.user.id);
    return jsonRes({ ok: true, type,
      account: { id: acc.user.id, login: u + "@" + key + ".vinhmath", email, role: accountRole },
    });
  } catch (e) {
    return jsonRes({ error: String((e as Error).message || e) }, 500);
  }
});
