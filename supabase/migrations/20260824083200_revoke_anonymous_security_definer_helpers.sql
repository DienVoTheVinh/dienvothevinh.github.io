-- Defense in depth: helper RPCs are only meaningful inside an authenticated
-- VinhMath session.  PostgreSQL grants EXECUTE to PUBLIC by default, so revoke
-- that inherited grant before granting the signed-in role explicitly.

revoke execute on function public.can_manage_class(uuid) from public, anon;
revoke execute on function public.can_see_class(uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_teacher() from public, anon;
revoke execute on function public.my_class() from public, anon;
revoke execute on function public.video_mode() from public, anon;

grant execute on function public.can_manage_class(uuid) to authenticated;
grant execute on function public.can_see_class(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.my_class() to authenticated;
grant execute on function public.video_mode() to authenticated;
