#!/usr/bin/env python3
"""
Generates the ExpiryScan monthly report(s), one per department that is due today. Each
department (Front Shop, Dispensary) has its own isolated SQLite database AND its own
settings row, which now includes up to 2 report recipient email addresses and a
"send on day of month" value (1-28). This script determines which department(s) are due
to send today (comparing each department's configured send day to the current day of
month), and for each due department produces its own standalone CSV export and JSON
summary -- reports are NOT combined, since each department can go to different people on
a different day.

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
import sqlite3
import json
import os
import sys
import argparse
from datetime import date, datetime

BASE_DIR = os.path.join(os.path.dirname(__file__), "..")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")

# department id -> (db filename, display label)
DEPARTMENTS = [
    ("front-shop", "data-front-shop.db", "Front Shop"),
    ("dispensary", "data-dispensary.db", "Dispensary"),
]

STATUS_LABEL = {
    "expired": "Expired",
    "critical": "Expiring soon",
    "warning": "Watch",
    "fresh": "Fresh",
}


def compute_status(days_until_expiry: int, warning_days: int, critical_days: int) -> str:
    if days_until_expiry < 0:
        return "expired"
    if days_until_expiry <= critical_days:
        return "critical"
    if days_until_expiry <= warning_days:
        return "warning"
    return "fresh"


def days_between_today_and(iso_date: str, today: date) -> int:
    target = datetime.strptime(iso_date, "%Y-%m-%d").date()
    return (target - today).days


def csv_escape(val) -> str:
    s = str(val)
    if any(c in s for c in [",", '"', "\n"]):
        s = '"' + s.replace('"', '""') + '"'
    return s


def read_department_settings(db_filename: str):
    """Cheaply reads just the settings row for a department, without touching batches.
    Returns None if the database doesn't exist yet (department has never been opened)."""
    db_path = os.path.join(BASE_DIR, db_filename)
    if not os.path.exists(db_path):
        return None

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT warning_days, critical_days, report_email_1, report_email_2, report_send_day "
        "FROM settings ORDER BY id LIMIT 1"
    )
    settings_row = cur.fetchone()
    conn.close()

    warning_days = settings_row["warning_days"] if settings_row else 90
    critical_days = settings_row["critical_days"] if settings_row else 30
    report_send_day = settings_row["report_send_day"] if settings_row else 1
    recipients = []
    if settings_row:
        for key in ("report_email_1", "report_email_2"):
            val = settings_row[key]
            if val and val.strip():
                recipients.append(val.strip())

    return {
        "warning_days": warning_days,
        "critical_days": critical_days,
        "report_send_day": report_send_day,
        "recipients": recipients,
    }


def build_department_report(db_filename: str, dept_label: str, today: date, dept_settings: dict):
    """Reads one department's batches and builds its full report + CSV. Only called for
    departments that are actually due today, so we don't write files no one needs."""
    db_path = os.path.join(BASE_DIR, db_filename)
    warning_days = dept_settings["warning_days"]
    critical_days = dept_settings["critical_days"]

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        SELECT b.id, b.quantity, b.expiry_date, b.scanned_at,
               p.barcode, p.name AS product_name
        FROM batches b
        JOIN products p ON p.id = b.product_id
        ORDER BY b.expiry_date ASC
        """
    )
    rows = cur.fetchall()
    conn.close()

    header = ["Barcode", "Product Name", "Quantity", "Expiry Date", "Days Until Expiry", "Status", "Scanned At"]
    csv_lines = [",".join(header)]
    counts = {"expired": 0, "critical": 0, "warning": 0, "fresh": 0}
    highlights = []

    for r in rows:
        days_until = days_between_today_and(r["expiry_date"], today)
        status = compute_status(days_until, warning_days, critical_days)
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

    today = datetime.strptime(args.today, "%Y-%m-%d").date() if args.today else date.today()

    departments_due = []
    any_db_found = False

    for _dept_id, db_filename, dept_label in DEPARTMENTS:
        dept_settings = read_department_settings(db_filename)
        if dept_settings is None:
            continue
        any_db_found = True
        if dept_settings["report_send_day"] == today.day:
            report = build_department_report(db_filename, dept_label, today, dept_settings)
            departments_due.append(report)

    if not any_db_found:
        print(json.dumps({"error": f"No department databases found under {BASE_DIR}"}))
        sys.exit(1)

    result = {
        "report_date": today.isoformat(),
        "departments_due": departments_due,
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
