#!/usr/bin/env python3
"""
Generates the ExpiryScan monthly report(s), one per department that is due today. Each
department (Front Shop, Dispensary) has its own isolated hosted Turso (libSQL) database
AND its own settings row, which includes up to 2 report recipient email addresses and a
"send on day of month" value (1-28). This script determines which department(s) are due
to send today (comparing each department's configured send day to the current day of
month), and for each due department produces its own standalone CSV export and JSON
summary -- reports are NOT combined, since each department can go to different people on
a different day.

Databases live on Turso (hosted libSQL), not local SQLite files -- the app itself
(deployed on Render) writes to these same hosted databases, so this script must read
from there too in order to see live production data. Connection details come from four
environment variables, loaded from expiry-tracker/.env if not already present in the
process environment:
    TURSO_DATABASE_URL_FRONT_SHOP, TURSO_AUTH_TOKEN_FRONT_SHOP,
    TURSO_DATABASE_URL_DISPENSARY, TURSO_AUTH_TOKEN_DISPENSARY

Usage:
    python3 monthly_report.py [--today YYYY-MM-DD]

    --today is optional and only meant for manual testing; without it, "today" is computed
    from the system clock. The caller (the scheduled task) is expected to invoke this once
    per day and rely on the per-department due-day check below to decide whether to act.

Outputs:
    Prints a JSON object to stdout: {
        "report_date": "YYYY-MM-DD",
        "departments_due": [
            {
                "department": "Front Shop" | "Dispensary",
                "csv_path": "...",                          # standalone CSV for this department only
                "counts": {"expired": N, "critical": N, "warning": N, "fresh": N},
                "highlights": [ {barcode, productName, quantity, expiryDate, daysUntilExpiry, status, statusLabel}, ... ],
                "total_batches": N,
                "warning_days": N,
                "critical_days": N,
                "report_send_day": N,
                "recipients": ["...", "..."],               # non-empty configured emails, may be empty list
            },
            ...
        ]
    }
    "departments_due" only contains departments whose configured send day matches today.
    If no department is due today, "departments_due" is an empty list -- the caller should
    do nothing (no email, no notification) in that case.
"""
import json
import os
import sys
import argparse
from datetime import date, datetime
from zoneinfo import ZoneInfo

# Always compute "today" in the pharmacy's own timezone, never the calling process's
# ambient/system timezone -- the caller (background cron subagent, interactive session,
# etc.) may default to UTC or something else entirely, which would silently shift "today"
# by a day right around the 8am Brisbane run time.
PHARMACY_TZ = ZoneInfo("Australia/Brisbane")

import requests

BASE_DIR = os.path.join(os.path.dirname(__file__), "..")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
ENV_PATH = os.path.join(BASE_DIR, ".env")

# department id -> (env var key suffix, display label)
DEPARTMENTS = [
    ("front-shop", "FRONT_SHOP", "Front Shop"),
    ("dispensary", "DISPENSARY", "Dispensary"),
]

STATUS_LABEL = {
    "expired": "Expired",
    "critical": "Expiring soon",
    "warning": "Watch",
    "fresh": "Fresh",
}


def load_env_file(path: str) -> None:
    """Loads KEY=VALUE lines from a .env file into os.environ, without overriding
    any value already set in the process environment."""
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            val = val.strip()
            if key and key not in os.environ:
                os.environ[key] = val


def turso_url_to_http(libsql_url: str) -> str:
    """Converts a libsql:// connection URL to the https:// URL used for Turso's HTTP
    (Hrana-over-HTTP) pipeline API."""
    if libsql_url.startswith("libsql://"):
        return "https://" + libsql_url[len("libsql://") :]
    return libsql_url


def turso_execute(base_url: str, auth_token: str, sql: str, args=None):
    """Runs a single SQL statement against a Turso database via the HTTP pipeline API
    and returns a list of row dicts (column name -> value)."""
    endpoint = turso_url_to_http(base_url).rstrip("/") + "/v2/pipeline"
    stmt = {"sql": sql}
    if args:
        stmt["args"] = [{"type": "text", "value": str(a)} for a in args]
    payload = {"requests": [{"type": "execute", "stmt": stmt}, {"type": "close"}]}
    resp = requests.post(
        endpoint,
        headers={
            "Authorization": f"Bearer {auth_token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    results = data.get("results", [])
    if not results:
        raise RuntimeError(f"Turso query returned no results: {data}")

    first = results[0]
    if first.get("type") == "error":
        raise RuntimeError(f"Turso query error: {first.get('error')}")

    exec_result = first["response"]["result"]
    cols = [c["name"] for c in exec_result.get("cols", [])]
    rows_out = []
    for row in exec_result.get("rows", []):
        row_dict = {}
        for col_name, cell in zip(cols, row):
            row_dict[col_name] = cell.get("value") if isinstance(cell, dict) else cell
        rows_out.append(row_dict)
    return rows_out


def csv_escape(val) -> str:
    s = str(val)
    if any(c in s for c in [",", '"', "\n"]):
        s = '"' + s.replace('"', '""') + '"'
    return s


def get_dept_connection(env_key_suffix: str):
    """Returns (base_url, auth_token) for a department, or None if not configured."""
    base_url = os.environ.get(f"TURSO_DATABASE_URL_{env_key_suffix}")
    auth_token = os.environ.get(f"TURSO_AUTH_TOKEN_{env_key_suffix}")
    if not base_url or not auth_token:
        return None
    return base_url, auth_token


def read_department_settings(env_key_suffix: str):
    """Cheaply reads just the settings row for a department from its hosted Turso
    database. Returns None if the department's connection isn't configured or the
    settings table can't be reached."""
    conn = get_dept_connection(env_key_suffix)
    if conn is None:
        return None
    base_url, auth_token = conn

    try:
        rows = turso_execute(
            base_url,
            auth_token,
            "SELECT warning_days, critical_days, report_email_1, report_email_2, report_send_day "
            "FROM settings ORDER BY id LIMIT 1",
        )
    except Exception:
        return None

    settings_row = rows[0] if rows else None
    warning_days = settings_row["warning_days"] if settings_row else 90
    critical_days = settings_row["critical_days"] if settings_row else 30
    report_send_day = settings_row["report_send_day"] if settings_row else 1
    recipients = []
    if settings_row:
        for key in ("report_email_1", "report_email_2"):
            val = settings_row.get(key)
            if val and str(val).strip():
                recipients.append(str(val).strip())

    return {
        "warning_days": int(warning_days),
        "critical_days": int(critical_days),
        "report_send_day": int(report_send_day),
        "recipients": recipients,
    }


def days_between_today_and(iso_date: str, today: date) -> int:
    target = datetime.strptime(iso_date, "%Y-%m-%d").date()
    return (target - today).days


def build_department_report(env_key_suffix: str, dept_label: str, today: date, dept_settings: dict):
    """Reads one department's batches from its hosted Turso database and builds its full
    report + CSV. Only called for departments that are actually due today, so we don't
    write files no one needs."""
    base_url, auth_token = get_dept_connection(env_key_suffix)
    warning_days = dept_settings["warning_days"]
    critical_days = dept_settings["critical_days"]

    rows = turso_execute(
        base_url,
        auth_token,
        """
        SELECT b.id, b.quantity, b.expiry_date, b.scanned_at,
               p.barcode, p.name AS product_name
        FROM batches b
        JOIN products p ON p.id = b.product_id
        ORDER BY b.expiry_date ASC
        """,
    )

    header = ["Barcode", "Product Name", "Quantity", "Expiry Date", "Days Until Expiry", "Status", "Scanned At"]
    csv_lines = [",".join(header)]
    counts = {"expired": 0, "critical": 0, "warning": 0, "fresh": 0}
    highlights = []

    def compute_status(days_until_expiry: int) -> str:
        if days_until_expiry < 0:
            return "expired"
        if days_until_expiry <= critical_days:
            return "critical"
        if days_until_expiry <= warning_days:
            return "warning"
        return "fresh"

    for r in rows:
        days_until = days_between_today_and(r["expiry_date"], today)
        status = compute_status(days_until)
        counts[status] += 1
        csv_lines.append(
            ",".join(
                csv_escape(v)
                for v in [
                    r["barcode"],
                    r["product_name"],
                    r["quantity"],
                    r["expiry_date"],
                    days_until,
                    status,
                    r["scanned_at"],
                ]
            )
        )
        if status in ("expired", "critical"):
            highlights.append(
                {
                    "barcode": r["barcode"],
                    "productName": r["product_name"],
                    "quantity": r["quantity"],
                    "expiryDate": r["expiry_date"],
                    "daysUntilExpiry": days_until,
                    "status": status,
                    "statusLabel": STATUS_LABEL[status],
                }
            )

    highlights.sort(key=lambda h: h["daysUntilExpiry"])

    os.makedirs(REPORTS_DIR, exist_ok=True)
    safe_label = dept_label.lower().replace(" ", "-")
    csv_filename = f"expiry-report-{safe_label}-{today.isoformat()}.csv"
    csv_path = os.path.join(REPORTS_DIR, csv_filename)
    with open(csv_path, "w", encoding="utf-8") as f:
        f.write("\n".join(csv_lines))

    return {
        "department": dept_label,
        "csv_path": os.path.abspath(csv_path),
        "counts": counts,
        "highlights": highlights,
        "total_batches": len(rows),
        "warning_days": warning_days,
        "critical_days": critical_days,
        "report_send_day": dept_settings["report_send_day"],
        "recipients": dept_settings["recipients"],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--today", help="Override today's date (YYYY-MM-DD) for testing", default=None)
    args = parser.parse_args()

    load_env_file(ENV_PATH)

    today = datetime.strptime(args.today, "%Y-%m-%d").date() if args.today else datetime.now(PHARMACY_TZ).date()

    departments_due = []
    any_db_found = False

    for _dept_id, env_key_suffix, dept_label in DEPARTMENTS:
        dept_settings = read_department_settings(env_key_suffix)
        if dept_settings is None:
            continue
        any_db_found = True
        if dept_settings["report_send_day"] == today.day:
            report = build_department_report(env_key_suffix, dept_label, today, dept_settings)
            departments_due.append(report)

    if not any_db_found:
        print(json.dumps({"error": "No department Turso databases could be reached. Check TURSO_DATABASE_URL_* / TURSO_AUTH_TOKEN_* environment variables in expiry-tracker/.env."}))
        sys.exit(1)

    result = {
        "report_date": today.isoformat(),
        "departments_due": departments_due,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
