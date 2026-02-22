import json
import os
import urllib.error
import urllib.request


def handler(event, _context):
    base_url = os.environ["BASE_URL"].rstrip("/")
    cron_secret = os.environ["CRON_SECRET"]
    path = (event or {}).get("path", "")

    if not path.startswith("/"):
        raise ValueError("Expected event.path to start with '/'.")

    url = f"{base_url}{path}"
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {cron_secret}",
            "Content-Type": "application/json",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8")
            return {
                "statusCode": response.status,
                "body": body,
                "url": url,
            }
    except urllib.error.HTTPError as error:
        return {
            "statusCode": error.code,
            "body": error.read().decode("utf-8"),
            "url": url,
        }
