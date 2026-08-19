"""Report credential indicators without ever printing credential values."""

import argparse
import base64
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
IGNORED = {".git", ".tools", ".source", ".source-package", "node_modules", "__pycache__"}
TEXT_SUFFIXES = {"", ".env", ".example", ".html", ".js", ".json", ".md", ".py", ".sql", ".toml", ".ts", ".txt", ".yaml", ".yml"}
RULES = {
    "jwt": re.compile(r"(?<![A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})(?![A-Za-z0-9_-])"),
    "supabase-secret": re.compile(r"(?<![A-Za-z0-9_-])(sb_secret_[A-Za-z0-9_-]{16,})(?![A-Za-z0-9_-])"),
    "postgres-credential-uri": re.compile(
        r"postgres(?:ql)?://(?P<user>[^\s:/]+):(?P<password>[^\s@]+)@[^\s'\"]+", re.I
    ),
}


def fingerprint(value):
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def jwt_role(token):
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))["role"]
    except Exception:
        return "unknown"


def inspect(label, text, findings):
    for kind, rule in RULES.items():
        for match in rule.finditer(text):
            value = match.group(1) if kind == "jwt" else match.group(0)
            detail = f" role={jwt_role(value)}" if kind == "jwt" else ""
            if kind == "postgres-credential-uri":
                value = match.group("password")
                if value.lower() in {"password", "[password]", "your_password", "your-password"}:
                    continue
                detail = " credential=password"
            findings.add((label, kind, fingerprint(value), len(value), detail))


def scan_worktree(findings):
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in IGNORED for part in path.parts) or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        inspect(str(path.relative_to(ROOT)), path.read_text(encoding="utf-8", errors="ignore"), findings)


def scan_commit(git, ref, findings):
    listing = subprocess.run(
        [git, "ls-tree", "-r", "-l", ref], cwd=ROOT, check=True, capture_output=True, text=True
    ).stdout.splitlines()
    for row in listing:
        meta, name = row.split("\t", 1)
        size = meta.rsplit(" ", 1)[-1]
        path = pathlib.PurePosixPath(name)
        if not size.isdigit() or int(size) > 2_000_000 or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        blob = subprocess.run([git, "show", f"{ref}:{name}"], cwd=ROOT, check=True, capture_output=True).stdout
        inspect(name, blob.decode("utf-8", errors="ignore"), findings)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--git")
    parser.add_argument("--ref")
    args = parser.parse_args()
    findings = set()
    if args.ref:
        if not args.git:
            parser.error("--git is required with --ref")
        scan_commit(args.git, args.ref, findings)
    else:
        scan_worktree(findings)
    for label, kind, digest, length, detail in sorted(findings):
        print(f"{label}: {kind} sha256={digest} length={length}{detail}")
    print(f"Indicators: {len(findings)}")
    return 1 if any(kind in {"supabase-secret", "postgres-credential-uri"} or (kind == "jwt" and "role=service_role" in detail) for _, kind, _, _, detail in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
