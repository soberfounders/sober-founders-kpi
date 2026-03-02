#!/usr/bin/env python3
"""
Backfill Zeffy XLSX exports into Supabase donations tables.

Usage example:
  python scripts/backfill_zeffy_exports.py \
    --transactions-xlsx "C:\\Users\\rusht\\Downloads\\Zeffy-export-1772429552143.xlsx" \
    --supporters-xlsx "C:\\Users\\rusht\\Downloads\\Zeffy-export-1772430632771.xlsx" \
    --supabase-url "$env:SUPABASE_URL" \
    --supabase-service-role-key "$env:SUPABASE_SERVICE_ROLE_KEY"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover
    ZoneInfo = None
    ZoneInfoNotFoundError = Exception


XML_NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

FIXED_OFFSET_TZ = {
    "UTC": 0,
    "Etc/UTC": 0,
    "America/New_York": -5,
    "Asia/Tokyo": 9,
}


def compact(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_decimal(value: Any) -> float | None:
    text = compact(value).replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if number == number else None


def parse_datetime_with_tz(value: Any, tz_name: str) -> str | None:
    text = compact(value)
    if not text:
        return None
    formats = [
        "%m/%d/%Y, %I:%M %p",
        "%m/%d/%Y %I:%M %p",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
    ]
    for fmt in formats:
        try:
            naive = datetime.strptime(text, fmt)
            localized = naive.replace(tzinfo=resolve_tzinfo(tz_name))
            return localized.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return None


def resolve_tzinfo(tz_name: str):
    if ZoneInfo is not None:
        try:
            return ZoneInfo(tz_name)
        except ZoneInfoNotFoundError:
            pass

    offset_hours = FIXED_OFFSET_TZ.get(tz_name)
    if offset_hours is None:
        offset_hours = 0
    return timezone(timedelta(hours=offset_hours))


def split_lists(value: Any) -> list[str]:
    text = compact(value)
    if not text:
        return []
    parts = [compact(part) for part in re.split(r"[;,]", text)]
    return [part for part in parts if part]


def normalize_email(value: Any) -> str | None:
    text = compact(value).lower()
    return text or None


def col_to_idx(col_name: str) -> int:
    idx = 0
    for ch in col_name:
        if not ch.isalpha():
            break
        idx = idx * 26 + (ord(ch.upper()) - ord("A") + 1)
    return idx - 1


def read_first_sheet_rows(xlsx_path: Path) -> list[list[str]]:
    with zipfile.ZipFile(xlsx_path) as zf:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for node in shared_root.findall("a:si", XML_NS):
                shared.append("".join(part.text or "" for part in node.findall(".//a:t", XML_NS)))

        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rels = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rid_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}

        sheet = workbook.find("a:sheets", XML_NS).find("a:sheet", XML_NS)
        sheet_rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = rid_target[sheet_rid]
        if not target.startswith("xl/"):
            target = f"xl/{target}"

        sheet_root = ET.fromstring(zf.read(target))
        row_nodes = sheet_root.find("a:sheetData", XML_NS).findall("a:row", XML_NS)

        output: list[list[str]] = []
        for row_node in row_nodes:
            max_idx = -1
            cells: dict[int, str] = {}
            for cell in row_node.findall("a:c", XML_NS):
                ref = cell.attrib.get("r", "")
                idx = col_to_idx(ref)
                max_idx = max(max_idx, idx)

                kind = cell.attrib.get("t", "")
                value_node = cell.find("a:v", XML_NS)
                if value_node is None:
                    value = ""
                else:
                    raw = value_node.text or ""
                    if kind == "s":
                        try:
                            value = shared[int(raw)]
                        except (ValueError, IndexError):
                            value = raw
                    else:
                        value = raw
                cells[idx] = value

            if max_idx < 0:
                output.append([])
                continue

            row = [""] * (max_idx + 1)
            for idx, value in cells.items():
                row[idx] = value
            output.append(row)
        return output


def row_value(row: list[str], header_idx: dict[str, int], name: str) -> str:
    idx = header_idx.get(name)
    if idx is None or idx >= len(row):
        return ""
    return row[idx]


def parse_transactions_export(path: Path, tz_name: str) -> list[dict[str, Any]]:
    rows = read_first_sheet_rows(path)
    if not rows:
        return []
    headers = [compact(v) for v in rows[0]]
    header_idx = {name: idx for idx, name in enumerate(headers) if name}

    required = {"Contact email", "Date", "Amount"}
    if not required.issubset(set(header_idx)):
        raise ValueError(f"{path.name} does not look like Zeffy transaction history export.")

    staged: list[dict[str, Any]] = []
    current = {
        "email": None,
        "first_name": None,
        "last_name": None,
        "address": None,
        "postal_code": None,
        "region": None,
        "city": None,
        "country": None,
        "total_amount": None,
        "total_eligible_amount": None,
    }

    for raw_row in rows[1:]:
        email = normalize_email(row_value(raw_row, header_idx, "Contact email"))
        first_name = compact(row_value(raw_row, header_idx, "First name")) or None
        last_name = compact(row_value(raw_row, header_idx, "Last name")) or None
        address = compact(row_value(raw_row, header_idx, "Address")) or None
        postal_code = compact(row_value(raw_row, header_idx, "Postal code")) or None
        region = compact(row_value(raw_row, header_idx, "Region")) or None
        city = compact(row_value(raw_row, header_idx, "City")) or None
        country = compact(row_value(raw_row, header_idx, "Country")) or None
        total_amount = parse_decimal(row_value(raw_row, header_idx, "Total amount"))
        total_eligible = parse_decimal(row_value(raw_row, header_idx, "Total eligible amount"))

        if email or first_name or last_name:
            current = {
                "email": email or current.get("email"),
                "first_name": first_name or current.get("first_name"),
                "last_name": last_name or current.get("last_name"),
                "address": address or current.get("address"),
                "postal_code": postal_code or current.get("postal_code"),
                "region": region or current.get("region"),
                "city": city or current.get("city"),
                "country": country or current.get("country"),
                "total_amount": total_amount if total_amount is not None else current.get("total_amount"),
                "total_eligible_amount": total_eligible if total_eligible is not None else current.get("total_eligible_amount"),
            }

        donated_at = parse_datetime_with_tz(row_value(raw_row, header_idx, "Date"), tz_name)
        amount = parse_decimal(row_value(raw_row, header_idx, "Amount"))
        if not donated_at or amount is None or amount <= 0:
            continue

        donor_email = current.get("email")
        donor_first_name = current.get("first_name")
        donor_last_name = current.get("last_name")
        donor_name = compact(f"{donor_first_name or ''} {donor_last_name or ''}") or None
        payment_method = compact(row_value(raw_row, header_idx, "Payment method")) or None
        eligible_amount = parse_decimal(row_value(raw_row, header_idx, "Eligible amount"))
        receipt_url = compact(row_value(raw_row, header_idx, "Receipt")) or None

        source_material = "|".join(
            [
                donor_email or "",
                donated_at,
                f"{amount:.2f}",
                payment_method or "",
                receipt_url or "",
            ]
        )
        source_hash = hashlib.sha1(source_material.encode("utf-8")).hexdigest()[:20]
        source_event_id = f"zeffy:export_txn:{source_hash}"

        staged.append(
            {
                "source_event_id": source_event_id,
                "zeffy_donation_id": None,
                "zeffy_payment_id": None,
                "donor_name": donor_name,
                "donor_first_name": donor_first_name,
                "donor_last_name": donor_last_name,
                "donor_email": donor_email,
                "amount": round(amount, 2),
                "currency": "USD",
                "fee_amount": None,
                "tip_amount": None,
                "net_amount": None,
                "eligible_amount": round(eligible_amount, 2) if eligible_amount is not None else None,
                "donated_at": donated_at,
                "source_created_at": donated_at,
                "status": "posted",
                "is_recurring": False,
                "campaign_name": None,
                "form_name": "Zeffy Export Backfill",
                "payment_method": payment_method,
                "receipt_url": receipt_url,
                "donor_company_name": None,
                "donor_language": None,
                "donor_city": current.get("city"),
                "donor_region": current.get("region"),
                "donor_postal_code": current.get("postal_code"),
                "donor_country": current.get("country"),
                "donor_address": {
                    "address": current.get("address"),
                    "city": current.get("city"),
                    "region": current.get("region"),
                    "postal_code": current.get("postal_code"),
                    "country": current.get("country"),
                },
                "source_file": path.name,
                "is_historical_backfill": True,
                "payload": {
                    "source": "zeffy_export_transactions",
                    "contact_total_amount": current.get("total_amount"),
                    "contact_total_eligible_amount": current.get("total_eligible_amount"),
                    "raw_row": {
                        "Contact email": donor_email,
                        "First name": donor_first_name,
                        "Last name": donor_last_name,
                        "Address": current.get("address"),
                        "Postal code": current.get("postal_code"),
                        "Region": current.get("region"),
                        "City": current.get("city"),
                        "Country": current.get("country"),
                        "Date": row_value(raw_row, header_idx, "Date"),
                        "Amount": row_value(raw_row, header_idx, "Amount"),
                        "Eligible amount": row_value(raw_row, header_idx, "Eligible amount"),
                        "Payment method": row_value(raw_row, header_idx, "Payment method"),
                        "Receipt": row_value(raw_row, header_idx, "Receipt"),
                    },
                },
                "ingested_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    by_email: dict[str, int] = {}
    for row in staged:
        key = row.get("donor_email") or row.get("donor_name") or row["source_event_id"]
        by_email[key] = by_email.get(key, 0) + 1
    for row in staged:
        key = row.get("donor_email") or row.get("donor_name") or row["source_event_id"]
        row["is_recurring"] = by_email.get(key, 0) > 1

    return staged


def parse_supporters_export(path: Path, tz_name: str) -> list[dict[str, Any]]:
    rows = read_first_sheet_rows(path)
    if not rows:
        return []
    headers = [compact(v) for v in rows[0]]
    header_idx = {name: idx for idx, name in enumerate(headers) if name}

    required = {"First name", "Last name", "Email", "Amount"}
    if not required.issubset(set(header_idx)):
        raise ValueError(f"{path.name} does not look like Zeffy supporter export.")

    output: list[dict[str, Any]] = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for raw_row in rows[1:]:
        email = normalize_email(row_value(raw_row, header_idx, "Email"))
        if not email:
            continue

        first_name = compact(row_value(raw_row, header_idx, "First name")) or None
        last_name = compact(row_value(raw_row, header_idx, "Last name")) or None
        name = compact(f"{first_name or ''} {last_name or ''}") or None
        commitment_amount = parse_decimal(row_value(raw_row, header_idx, "Amount"))
        first_payment_at = parse_datetime_with_tz(row_value(raw_row, header_idx, "First payment date (Asia/Tokyo)"), tz_name)
        last_payment_at = parse_datetime_with_tz(row_value(raw_row, header_idx, "Last payment date (Asia/Tokyo)"), tz_name)
        language = compact(row_value(raw_row, header_idx, "Language")) or None
        address = compact(row_value(raw_row, header_idx, "Address")) or None
        city = compact(row_value(raw_row, header_idx, "City")) or None
        postal_code = compact(row_value(raw_row, header_idx, "Postal code")) or None
        country = compact(row_value(raw_row, header_idx, "Country")) or None
        region = compact(row_value(raw_row, header_idx, "Region")) or None
        company_name = compact(row_value(raw_row, header_idx, "Company name")) or None
        manual_lists = split_lists(row_value(raw_row, header_idx, "Manual lists"))

        output.append(
            {
                "donor_email": email,
                "donor_name": name,
                "donor_first_name": first_name,
                "donor_last_name": last_name,
                "donor_language": language,
                "donor_company_name": company_name,
                "donor_address": address,
                "donor_city": city,
                "donor_region": region,
                "donor_postal_code": postal_code,
                "donor_country": country,
                "commitment_amount": round(commitment_amount, 2) if commitment_amount is not None else None,
                "first_payment_at": first_payment_at,
                "last_payment_at": last_payment_at,
                "manual_lists": manual_lists,
                "source_file": path.name,
                "payload": {
                    "source": "zeffy_export_supporters",
                    "raw_row": {
                        "First name": row_value(raw_row, header_idx, "First name"),
                        "Last name": row_value(raw_row, header_idx, "Last name"),
                        "Email": row_value(raw_row, header_idx, "Email"),
                        "Amount": row_value(raw_row, header_idx, "Amount"),
                        "First payment date (Asia/Tokyo)": row_value(raw_row, header_idx, "First payment date (Asia/Tokyo)"),
                        "Last payment date (Asia/Tokyo)": row_value(raw_row, header_idx, "Last payment date (Asia/Tokyo)"),
                        "Language": row_value(raw_row, header_idx, "Language"),
                        "Address": row_value(raw_row, header_idx, "Address"),
                        "City": row_value(raw_row, header_idx, "City"),
                        "Postal code": row_value(raw_row, header_idx, "Postal code"),
                        "Country": row_value(raw_row, header_idx, "Country"),
                        "Region": row_value(raw_row, header_idx, "Region"),
                        "Company name": row_value(raw_row, header_idx, "Company name"),
                        "Manual lists": row_value(raw_row, header_idx, "Manual lists"),
                    },
                },
                "imported_at": now_iso,
                "updated_at": now_iso,
            }
        )
    return output


def chunked(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[idx: idx + size] for idx in range(0, len(items), size)]


def post_upsert(
    *,
    supabase_url: str,
    service_role_key: str,
    table: str,
    conflict: str,
    rows: list[dict[str, Any]],
    dry_run: bool,
    chunk_size: int = 500,
) -> int:
    if not rows:
        return 0
    if dry_run:
        return len(rows)

    base = supabase_url.rstrip("/")
    endpoint = f"{base}/rest/v1/{table}?on_conflict={quote(conflict)}"
    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }

    written = 0
    for batch in chunked(rows, chunk_size):
        body = json.dumps(batch).encode("utf-8")
        req = Request(endpoint, data=body, method="POST", headers=headers)
        with urlopen(req, timeout=60) as resp:
            status = resp.getcode()
            if status < 200 or status >= 300:
                payload = resp.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"Upsert failed for {table} (status={status}): {payload}")
        written += len(batch)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill Zeffy exports into Supabase donations tables.")
    parser.add_argument("--transactions-xlsx", required=True, help="Path to Zeffy grouped transaction XLSX export.")
    parser.add_argument("--supporters-xlsx", required=True, help="Path to Zeffy supporter XLSX export.")
    parser.add_argument("--txn-timezone", default="America/New_York", help="Timezone for transaction dates when export omits timezone.")
    parser.add_argument("--supporter-timezone", default="Asia/Tokyo", help="Timezone for supporter first/last payment dates.")
    parser.add_argument("--supabase-url", default=os.getenv("SUPABASE_URL", ""), help="Supabase project URL.")
    parser.add_argument(
        "--supabase-service-role-key",
        default=os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        help="Supabase service role key.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Parse and summarize without writing to Supabase.")
    args = parser.parse_args()

    tx_path = Path(args.transactions_xlsx).expanduser()
    supporter_path = Path(args.supporters_xlsx).expanduser()
    if not tx_path.exists():
        raise FileNotFoundError(f"Missing transactions export: {tx_path}")
    if not supporter_path.exists():
        raise FileNotFoundError(f"Missing supporters export: {supporter_path}")

    donations = parse_transactions_export(tx_path, args.txn_timezone)
    supporters = parse_supporters_export(supporter_path, args.supporter_timezone)

    if not donations:
        raise RuntimeError("No donation transactions were parsed from the transactions export.")

    if not args.dry_run:
        if not args.supabase_url or not args.supabase_service_role_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is used.")

    written_donations = post_upsert(
        supabase_url=args.supabase_url,
        service_role_key=args.supabase_service_role_key,
        table="raw_zeffy_donations",
        conflict="source_event_id",
        rows=donations,
        dry_run=args.dry_run,
    )
    written_supporters = post_upsert(
        supabase_url=args.supabase_url,
        service_role_key=args.supabase_service_role_key,
        table="raw_zeffy_supporter_profiles",
        conflict="donor_email",
        rows=supporters,
        dry_run=args.dry_run,
    )

    donation_total = sum(float(row.get("amount") or 0) for row in donations)
    unique_donors = len(
        {
            row.get("donor_email") or row.get("donor_name") or row.get("source_event_id")
            for row in donations
        }
    )

    print(
        json.dumps(
            {
                "dry_run": bool(args.dry_run),
                "transactions_file": str(tx_path),
                "supporters_file": str(supporter_path),
                "transactions_parsed": len(donations),
                "supporters_parsed": len(supporters),
                "transactions_written": written_donations,
                "supporters_written": written_supporters,
                "transactions_total_amount": round(donation_total, 2),
                "unique_transaction_donors": unique_donors,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
