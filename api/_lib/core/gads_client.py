"""Google Ads REST API helpers — no gRPC / google-ads SDK required."""
from __future__ import annotations

import itertools
import math
import random
import re
import time
from pathlib import Path
from typing import Callable, Optional

import pandas as pd
import requests
import yaml

QPS_SLEEP = 1.2
_GADS_REST_BASE = "https://googleads.googleapis.com/v20"
MONTHS = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]


class _RateLimitError(Exception):
    pass


def _norm_id(x) -> str:
    return str(x).replace("-", "").strip() if x else ""


def _get_access_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    """Exchange a refresh token for a short-lived OAuth2 access token."""
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_gads_credentials(config: dict) -> dict:
    """
    Extract and validate Google Ads credentials from a config dict (env vars).
    Falls back to a local google-ads.yaml if env vars are not set.
    Returns a credentials dict; raises RuntimeError if credentials are missing.
    """
    creds: dict = {
        "developer_token": config.get("GOOGLE_ADS_DEVELOPER_TOKEN"),
        "client_id": config.get("GOOGLE_ADS_CLIENT_ID"),
        "client_secret": config.get("GOOGLE_ADS_CLIENT_SECRET"),
        "refresh_token": config.get("GOOGLE_ADS_REFRESH_TOKEN"),
        "login_customer_id": config.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID"),
        "client_customer_id": config.get("GOOGLE_ADS_CLIENT_CUSTOMER_ID"),
    }

    if not creds["developer_token"]:
        yaml_path = Path(__file__).parent.parent / "google-ads.yaml"
        if yaml_path.exists():
            with open(yaml_path, "r", encoding="utf-8") as fh:
                file_cfg = yaml.safe_load(fh) or {}
            for key, yaml_key in [
                ("developer_token", "developer_token"),
                ("client_id", "client_id"),
                ("client_secret", "client_secret"),
                ("refresh_token", "refresh_token"),
                ("login_customer_id", "login_customer_id"),
                ("client_customer_id", "client_customer_id"),
            ]:
                creds[key] = creds[key] or file_cfg.get(yaml_key)
        else:
            raise RuntimeError(
                "No Google Ads credentials found (set env vars or provide google-ads.yaml)."
            )

    creds["customer_id"] = _norm_id(
        creds.get("client_customer_id") or creds.get("login_customer_id")
    )
    return creds


def _build_headers(creds: dict) -> dict:
    """Return HTTP headers for a Google Ads REST request (refreshes token each call)."""
    access_token = _get_access_token(
        creds["client_id"], creds["client_secret"], creds["refresh_token"]
    )
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": creds["developer_token"],
        "Content-Type": "application/json",
    }
    if creds.get("login_customer_id"):
        headers["login-customer-id"] = _norm_id(creds["login_customer_id"])
    return headers


def _batched(iterable, n: int):
    it = iter(iterable)
    size = max(1, n)
    while True:
        chunk = list(itertools.islice(it, size))
        if not chunk:
            break
        yield chunk


def _sleep_with_retry_delay(retry_seconds: Optional[float], attempt: int) -> None:
    if retry_seconds is not None:
        time.sleep(retry_seconds + 1.0)
    else:
        base = min(60.0, 4.0 * (2 ** max(attempt, 0)))
        time.sleep(base + random.random())


def load_gads_constants():
    """Load country/language dropdown data from gads_exports CSVs."""
    base = Path(__file__).parent.parent / "gads_exports"
    countries_path = base / "geo_target_countries.csv"
    languages_path = base / "language_constants.csv"
    if not countries_path.exists() or not languages_path.exists():
        return None, None
    try:
        countries = pd.read_csv(countries_path, dtype=str).fillna("")
        languages = pd.read_csv(languages_path, dtype=str).fillna("")
    except Exception:
        return None, None
    if "status" in countries.columns:
        countries = countries[countries["status"].str.upper() == "ENABLED"]
    return countries, languages


def fetch_historical_metrics_gads(
    creds: dict,
    customer_id: str,
    keywords: list,
    geo_ids: list,
    language_id: str,
    batch_size: int = 700,
    progress_callback: Optional[Callable] = None,
) -> tuple:
    """
    Fetch keyword historical metrics via Google Ads REST API.
    Returns (df, raw_results) — same shape as the old gRPC implementation.
    """
    if not keywords:
        return pd.DataFrame(), []

    url = (
        f"{_GADS_REST_BASE}/customers/{customer_id}"
        "/keywordPlanIdeas:generateKeywordHistoricalMetrics"
    )
    headers = _build_headers(creds)
    out_rows: list = []
    raw_results: list = []
    batches = math.ceil(len(keywords) / max(1, batch_size))

    for idx, chunk in enumerate(_batched(keywords, batch_size)):
        body = {
            "keywords": chunk,
            "keywordPlanNetwork": "GOOGLE_SEARCH",
            "language": f"languageConstants/{language_id}",
            "geoTargetConstants": [f"geoTargetConstants/{gid}" for gid in geo_ids],
            "historicalMetricsOptions": {"includeAverageMonthlySearches": True},
        }

        attempts = 0
        resp_data: dict = {}
        while True:
            try:
                time.sleep(QPS_SLEEP)
                resp = requests.post(url, headers=headers, json=body, timeout=60)
                if resp.status_code == 429 or (
                    resp.status_code >= 500 and "RATE_LIMIT" in resp.text
                ):
                    raise _RateLimitError(resp.text)
                resp.raise_for_status()
                resp_data = resp.json()
                break
            except _RateLimitError as exc:
                attempts += 1
                if attempts > 8:
                    raise
                m = re.search(r"Retry in (\d+)\s*second", str(exc))
                _sleep_with_retry_delay(float(m.group(1)) if m else None, attempts - 1)
                headers = _build_headers(creds)
            except requests.HTTPError:
                attempts += 1
                if attempts > 8:
                    raise
                _sleep_with_retry_delay(None, attempts - 1)
                headers = _build_headers(creds)

        results = resp_data.get("results", [])
        raw_results.extend(results)

        for r in results:
            text = r.get("text", "")
            close_variants = r.get("closeVariants", [])
            km = r.get("keywordMetrics", {})

            canonical = text.lower().strip()
            variants = [v.lower().strip() for v in close_variants]
            aliases = [canonical] + [v for v in variants if v]

            avg_ms = km.get("avgMonthlySearches")
            comp_idx = km.get("competitionIndex")
            base = {
                "canonical_keyword": canonical,
                "aliases": aliases,
                "close_variants": ", ".join(variants) if variants else "",
                "avg_monthly_searches": int(avg_ms) if avg_ms is not None else None,
                "competition_index": int(comp_idx) if comp_idx is not None else None,
                "competition_level": km.get("competition", ""),
            }

            monthly_volumes = km.get("monthlySearchVolumes", [])
            if monthly_volumes:
                for mv in monthly_volumes:
                    month_name = mv.get("month", "JANUARY")
                    month_num = (MONTHS.index(month_name) + 1) if month_name in MONTHS else 0
                    ms = mv.get("monthlySearches")
                    out_rows.append(base | {
                        "year": int(mv.get("year", 0)),
                        "month": month_num,
                        "monthly_searches": int(ms) if ms is not None else None,
                    })
            else:
                out_rows.append(base | {"year": None, "month": None, "monthly_searches": None})

        pct = min((idx + 1) / max(batches, 1), 1.0)
        if progress_callback:
            progress_callback(pct, idx + 1, batches)

    df = pd.DataFrame(out_rows)
    if not df.empty and "aliases" in df.columns:
        df = df.explode("aliases", ignore_index=True).rename(columns={"aliases": "keyword_norm"})
    else:
        df["keyword_norm"] = ""
    return df, raw_results
