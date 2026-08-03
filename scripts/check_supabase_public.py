"""Smoke-test public Supabase access without printing the publishable key."""

import json
import pathlib
import re
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = (ROOT / "js" / "config.js").read_text(encoding="utf-8")


def config_value(name):
    match = re.search(rf"{name}\s*:\s*[\"']([^\"']+)[\"']", CONFIG)
    if not match:
        raise RuntimeError(f"Missing {name} in js/config.js")
    return match.group(1)


def request(url, headers=None, method="GET", body=None):
    req = urllib.request.Request(url, headers=headers or {}, method=method, data=body)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.status
    except urllib.error.HTTPError as exc:
        return exc.code


def main():
    url = config_value("SUPABASE_URL").rstrip("/")
    key = config_value("SUPABASE_ANON_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    checks = {
        "auth_health": request(f"{url}/auth/v1/health", {"apikey": key}),
        "public_lessons": request(f"{url}/rest/v1/lessons?select=id&limit=1", headers),
    }
    for slug in ("latex", "nop-bai", "gemini-chat", "tao-tai-khoan"):
        checks[f"{slug}_rejects_unauthenticated"] = request(
            f"{url}/functions/v1/{slug}",
            {"Content-Type": "application/json"},
            method="POST",
            body=json.dumps({}).encode(),
        )
    failures = []
    for name, status in checks.items():
        expected = status in (200, 204) if name in ("auth_health", "public_lessons") else status in (401, 403)
        print(f"{'PASS' if expected else 'FAIL'} {name}: HTTP {status}")
        if not expected:
            failures.append(name)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
