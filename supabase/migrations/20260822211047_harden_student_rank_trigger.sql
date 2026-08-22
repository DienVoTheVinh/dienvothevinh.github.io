-- Trigger helpers run only from Postgres triggers. They must not be callable
-- through PostgREST by anonymous or signed-in clients.
revoke execute on function public.ensure_student_rank_progress()
from public, anon, authenticated;
