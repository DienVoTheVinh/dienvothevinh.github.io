"""Read-only lesson connectivity check using public client credentials."""

import json
import os
import urllib.parse
import urllib.request


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the process environment.")
        return 2

    query = urllib.parse.urlencode({"select": "id,title", "limit": "3"})
    request = urllib.request.Request(
        f"{url}/rest/v1/lessons?{query}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        lessons = json.load(response)
    print(f"Connectivity OK; received {len(lessons)} lesson summaries.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
