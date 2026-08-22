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
    const fullName = String(body.fullName || "").trim();
    const baseU = String(body.username || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const password = String(body.password || "");
    const password2 = String(body.password2 || password);

    // Portal students are admin-only. Partner managers deliberately do not get
    // the broad teacher role or access to this service-role operation.
    if (["gv", "tg", "portal_hs"].includes(type)) {
      if (prof.role !== "admin") return jsonRes({ error: "Chi Quan tri duoc tao loai tai khoan nay" }, 403);
    } else if (!["admin", "teacher"].includes(prof.role)) {
      return jsonRes({ error: "Chi Quan tri / Giao vien duoc tao tai khoan" }, 403);
    }

    if (!fullName) return jsonRes({ error: "Thieu ho ten" }, 400);
    if (!baseU) return jsonRes({ error: "Ten dang nhap khong hop le" }, 400);
    if (password.length < 6 || password2.length < 6) return jsonRes({ error: "Mat khau toi thieu 6 ky tu" }, 400);

    async function timU(needPh: boolean): Promise<string | null> {
      for (let i = 1; i <= 60; i++) {
        const cand = i === 1 ? baseU : baseU + i;
        const names = needPh ? [cand, cand + "_ph"] : [cand];
        const { data: taken } = await svc.from("profiles").select("username").in("username", names);
        if (!taken || taken.length === 0) return cand;
      }
      return null;
    }

    if (type === "portal_hs") {
      const portalId = String(body.portalId || "");
      const { data: portal } = await svc.from("exam_portals").select("id,slug,is_active").eq("id", portalId).maybeSingle();
      if (!portal || !portal.is_active) return jsonRes({ error: "Portal khong ton tai hoac dang tam dung" }, 404);
      const u = await timU(false);
      if (!u) return jsonRes({ error: "Khong tao duoc ten dang nhap duy nhat" }, 409);
      const email = `${u}@hs.${portal.slug}.vinhmath.com`;
      const { data: acc, error: accErr } = await svc.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (accErr || !acc?.user) return jsonRes({ error: "Tao TK hoc sinh loi: " + (accErr?.message || "unknown") }, 500);
      const profileResult = await svc.from("profiles").update({ full_name: fullName, username: u, role: "student" }).eq("id", acc.user.id);
      const memberResult = await svc.from("exam_portal_members").insert({
        portal_id: portal.id, user_id: acc.user.id, member_role: "student", portal_only: true,
      });
      if (profileResult.error || memberResult.error) {
        await svc.auth.admin.deleteUser(acc.user.id).catch(() => {});
        return jsonRes({ error: "Khong gan duoc tai khoan vao portal" }, 500);
      }
      return jsonRes({ ok: true, type, login: `${u}@hs.${portal.slug}` });
    }

    if (type === "hs_ph") {
      const u = await timU(true);
      if (!u) return jsonRes({ error: "Khong tao duoc ten dang nhap duy nhat" }, 409);
      const hsEmail = u + "@" + DOMAIN.hs;
      const phEmail = u + "@" + DOMAIN.ph;
      const { data: hs, error: hsErr } = await svc.auth.admin.createUser({
        email: hsEmail, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (hsErr || !hs?.user) return jsonRes({ error: "Tao TK hoc sinh loi: " + (hsErr?.message || "unknown") }, 500);
      const { data: ph, error: phErr } = await svc.auth.admin.createUser({
        email: phEmail, password: password2, email_confirm: true, user_metadata: { full_name: "Phụ huynh " + fullName },
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
    const { data: acc, error: accErr } = await svc.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (accErr || !acc?.user) return jsonRes({ error: "Tao TK loi: " + (accErr?.message || "unknown") }, 500);
    await svc.from("profiles").update({ full_name: fullName }).eq("id", acc.user.id);
    return jsonRes({ ok: true, type,
      account: { id: acc.user.id, login: u + "@" + key + ".vinhmath", email, role: type === "gv" ? "teacher" : "assistant" },
    });
  } catch (e) {
    return jsonRes({ error: String((e as Error).message || e) }, 500);
  }
});
