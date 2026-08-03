# VinhMath development

## Local preview

The production website lives at the repository root. Start the dependency-free preview server:

```powershell
.\scripts\dev.cmd
```

Open `http://127.0.0.1:8000/`. The server maps clean paths such as `/dang-nhap` to `dang-nhap.html`, matching GitHub Pages-style navigation. Run all checks with `.\scripts\check.cmd`. PowerShell users may alternatively run the `.ps1` wrappers with an execution policy allowed by their environment.

When network access is available, validate third-party resources referenced by production pages with `python .\scripts\check_external_links.py`.
Run `python .\scripts\check_supabase_public.py` for a public API/Auth health check and to confirm all four Edge Functions reject unauthenticated requests. The script reads only the browser-safe publishable key already used by the production client and never prints it.

## Change workflow

1. Create a focused branch from the latest `main` in a real Git clone.
2. Make the smallest local change and run the preview plus workspace checks.
3. Push the branch and open a draft pull request; do not deploy from an unreviewed branch.
4. Record test evidence and request approval.
5. Merge only after approval and required checks. Production deployment is a separate, explicit action after approval.

This setup snapshot has no Git history because the runtime lacked a working HTTPS remote helper and native Git transport was blocked. Do not run `git init` here and do not push from this snapshot. Re-clone with a complete Git installation before publishing changes.

## Supabase workflow

The linked project ref is `nrnokgciogxqzjqjeuwi`. The `supabase/` folder mirrors deployed Edge Function source and records read-only project metadata. Never commit `.env`, service-role/secret keys, database passwords, refresh tokens, API secrets, or user data.

Browser code uses a publishable key only. Server-side scripts must read `SUPABASE_SECRET_KEY` from a local secret store or ignored `.env`; use `web/supabase/server.env.example` as the variable-name template. Direct Postgres credentials belong only in a secret manager and must never appear in examples or scripts.

The public upstream history contained hardcoded Postgres credentials. The worktree is sanitized, but history remains compromised until the database password is rotated. Supabase documents that changing the managed project password keeps its own services available, while any external direct-database clients must be updated manually. Inventory those external clients before rotation; do not rotate blindly.

For a future database change:

1. Install a pinned Supabase CLI locally or use an approved project tool, then inspect each command with `--help`.
2. Create the migration with `supabase migration new <name>`; never invent a version filename.
3. Develop against a local database or approved development branch, never production.
4. Review SQL for least privilege. Enable RLS on exposed tables; policies must enforce ownership/authorization, and UPDATE policies need both `USING` and `WITH CHECK`.
5. Avoid `SECURITY DEFINER` unless strictly required; keep privileged functions out of exposed schemas and revoke public execution.
6. Run security and performance advisors, review the diff and migration list, and attach results to the draft PR.
7. Apply/deploy only after explicit approval. Auth, Storage, secrets, migrations, and Edge Functions are outside routine website preview work.

Current advisor findings are captured in `supabase/snapshots/current.json`; setup did not remediate them because that would change production.
