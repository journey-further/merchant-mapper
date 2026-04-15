#!/usr/bin/env python3
"""
Local development API server.

Runs alongside `npm run dev` and ports the old Flask workflow onto JSON endpoints
used by the Vite app.
"""
from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import io
import json
import os
import tempfile
import uuid
import zipfile
from urllib.parse import parse_qs, urlparse

import pandas as pd

from api._lib.core.category_extraction import extract_categories, preferred_category_column
from api._lib.core.chart_data import build_chart_data, chronological_spec, seasonality_spec
from api._lib.core.colour_mapping import (
    add_suggestions,
    apply_colour_mapping,
    colour_summary,
    detect_colour_columns,
    load_colour_mapping,
    mapping_breakdown,
    merge_new_mappings,
    unmapped_colours,
)
from api._lib.core.exporters import to_csv_bytes, to_xlsx_bytes
from api._lib.core.feed_processor import (
    RECOMMENDED_RAW,
    apply_column_selection,
    apply_filters,
    apply_numeric_filters,
    count_products,
    default_keep_map,
    derive_age_gender_segment,
    filter_options,
    numeric_filter_options,
    split_price_columns,
)
from api._lib.core.gads_client import load_gads_constants, get_gads_client_and_customer_id, fetch_historical_metrics_gads
from api._lib.core.gads_opportunity import compute_opportunity, compute_sales_opportunity
from api._lib.core.keyword_builder import make_keywords
from api._lib.core.product_groups import (
    apply_grouping,
    compute_group_stats,
    feed_label_rollup,
    format_rollup,
    group_candidates,
)
from api._lib.core.utils import norm

# Load .env if present (for local Google Ads credentials)
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _ef:
        for _line in _ef:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                os.environ.setdefault(_k.strip(), _v.strip())

UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "merchant-mapper-dev")
os.makedirs(UPLOAD_DIR, exist_ok=True)
HOST = os.environ.get("DEV_SERVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("DEV_SERVER_PORT", "8787"))
PREVIEW_ROWS = 100

BLOBS: dict[str, dict] = {}


def _blob_url(bid: str) -> str:
    return f"http://{HOST}:{PORT}/dev-blobs/{bid}"


def _save_blob_df(df: pd.DataFrame, label: str = "blob") -> str:
    bid = str(uuid.uuid4())
    path = os.path.join(UPLOAD_DIR, bid)
    df.to_parquet(path, index=False)
    BLOBS[bid] = {"filename": f"{label}.parquet", "content_type": "application/octet-stream"}
    return _blob_url(bid)


def _load_blob_df(url: str) -> pd.DataFrame:
    bid = url.rstrip("/").split("/")[-1]
    path = os.path.join(UPLOAD_DIR, bid)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Blob not found: {bid}")
    return pd.read_parquet(path)


def _read_stream(handle, ext: str):
    if ext in (".tsv", ".txt"):
        return pd.read_csv(handle, sep="\t", dtype=str, low_memory=False)
    if ext == ".csv":
        return pd.read_csv(handle, dtype=str, low_memory=False)
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(handle, dtype=str)
    raise ValueError(f"Unsupported extension: {ext}")


def _read_file(filepath: str, filename: str):
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".zip":
        with zipfile.ZipFile(filepath) as archive:
            inner = next(
                (
                    name for name in archive.namelist()
                    if name.endswith((".tsv", ".txt", ".csv", ".xlsx", ".xls"))
                    and not name.startswith("__MACOSX")
                ),
                archive.namelist()[0],
            )
            with archive.open(inner) as handle:
                filename = os.path.basename(inner)
                ext = os.path.splitext(filename)[1].lower()
                return _read_stream(handle, ext), filename
    with open(filepath, "rb") as handle:
        return _read_stream(handle, ext), filename


def _find_clicks_col(df: pd.DataFrame) -> str | None:
    n2o = {norm(c): c for c in df.columns}
    return (
        n2o.get(norm("all clicks"))
        or n2o.get(norm("all_clicks"))
        or n2o.get(norm("28 day clicks"))
        or n2o.get(norm("clicks"))
    )


def _clicks_sorted_preview(raw_df: pd.DataFrame, preview_df: pd.DataFrame, limit: int = PREVIEW_ROWS) -> pd.DataFrame:
    clicks_col = _find_clicks_col(raw_df)
    if clicks_col:
        nums = pd.to_numeric(raw_df[clicks_col].astype(str).str.extract(r"([\d.]+)")[0], errors="coerce")
        sorted_idx = nums.sort_values(ascending=False, na_position="last").index
        preview_df = preview_df.reindex(sorted_idx)
    return preview_df.head(limit).fillna("")


def _column_meta(df: pd.DataFrame, keep_map: dict[str, bool]) -> list[dict]:
    top_idx = None
    clicks_col = _find_clicks_col(df)
    if clicks_col:
        nums = pd.to_numeric(df[clicks_col].astype(str).str.extract(r"([\d.]+)")[0], errors="coerce")
        if nums.notna().any():
            top_idx = nums.idxmax()
    sample = (df.loc[[top_idx]] if top_idx is not None else df.head(1)).astype(str).T.reset_index()
    sample.columns = ["Column", "Example"]
    unique_counts = [
        int(pd.Series(df[c]).astype(str).str.strip().replace("", pd.NA).dropna().nunique())
        for c in df.columns
    ]
    return [
        {
            "column": c,
            "keep": bool(keep_map.get(c, False)),
            "example": sample.loc[sample["Column"] == c, "Example"].values[0] if c in sample["Column"].values else "",
            "unique": unique_counts[i],
        }
        for i, c in enumerate(df.columns)
    ]


def _records(df: pd.DataFrame, limit: int = PREVIEW_ROWS) -> list[dict]:
    return df.head(limit).fillna("").astype(object).to_dict(orient="records")


def _load_colour_map_blob(url: str | None) -> pd.DataFrame | None:
    if not url:
        return None
    try:
        return _load_blob_df(url)
    except Exception:
        return None


def _get_processed_df(raw_df: pd.DataFrame, params: dict) -> pd.DataFrame:
    keep_map = params.get("keepMap", {})
    filters = params.get("filters", {})
    group_col = params.get("groupCol")
    colour_col = params.get("colourCol")
    cat_src_col = params.get("catSrcCol")
    want_main = bool(params.get("wantMain"))
    want_penultimate = bool(params.get("wantPenultimate"))
    want_final = bool(params.get("wantFinal"))
    colour_map_df = _load_colour_map_blob(params.get("colourMapBlobUrl"))
    if colour_map_df is None:
        colour_map_df = load_colour_mapping()

    df = apply_column_selection(raw_df, keep_map) if keep_map else raw_df.copy()
    df = apply_filters(df, filters)

    raw_filtered = apply_filters(raw_df, filters)
    candidates = group_candidates(raw_filtered)
    chosen_group = group_col if group_col in candidates else (candidates[0] if candidates else None)
    if chosen_group:
        stats = compute_group_stats(raw_filtered, candidates)
        df["image_group_id"] = apply_grouping(raw_filtered, chosen_group, stats)["image_group_id"]

    if colour_col and colour_col in raw_filtered.columns and colour_map_df is not None and not colour_map_df.empty:
        mapped = apply_colour_mapping(raw_filtered, colour_col, colour_map_df)["generic_colour"].reindex(df.index).fillna("")
        generic_like = [c for c in df.columns if c.strip().lower() in {"generic_colour", "generic colour", "normalised colour"}]
        if generic_like:
            df = df.drop(columns=generic_like, errors="ignore")
        df["Normalised Colour"] = mapped

    if cat_src_col and cat_src_col in df.columns:
        df = extract_categories(df, cat_src_col, want_main, want_penultimate, want_final)

    df = split_price_columns(df)

    return df


def _parse_state(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _build_preset_combos(processed_df: pd.DataFrame) -> list[dict]:
    available_cols = list(processed_df.columns)
    col_set = set(available_cols)
    col_lower = {c.lower(): c for c in available_cols}
    material_col = col_lower.get("material")
    presets = [
        {"name": "Gender + Category", "fields": ["Age Gender Segment", "Final Category"], "splitAmpersand": True},
        {"name": "Gender + Colour + Category", "fields": ["Age Gender Segment", "Normalised Colour", "Final Category"], "splitAmpersand": True},
        {"name": "Material + Category", "fields": ["_material_", "Final Category"], "splitAmpersand": True},
        {"name": "Colour + Material + Category", "fields": ["Normalised Colour", "_material_", "Final Category"], "splitAmpersand": True},
    ]
    combos: list[dict] = []
    for preset in presets:
        fields = [material_col if f == "_material_" else f for f in preset["fields"]]
        if not all(f and f in col_set for f in fields):
            continue
        sub = processed_df[fields].astype(str).apply(lambda s: s.str.strip().str.lower())
        if not (~sub.isin({"", "nan", "none", "null", "<na>"})).all(axis=1).any():
            continue
        combos.append({
            "name": preset["name"],
            "fields": fields,
            "splitAmpersand": preset["splitAmpersand"],
        })
    return combos or [{"name": "", "fields": [], "splitAmpersand": False}]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        status = args[1] if len(args) > 1 else "?"
        print(f"  {self.command:6} {self.path}  {status}")

    def _body(self) -> bytes:
        transfer = self.headers.get("Transfer-Encoding", "")
        if "chunked" in transfer.lower():
            chunks = []
            while True:
                size = int(self.rfile.readline().strip(), 16)
                if size == 0:
                    self.rfile.readline()
                    break
                chunks.append(self.rfile.read(size))
                self.rfile.read(2)
            return b"".join(chunks)
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def _json_body(self) -> dict:
        raw = self._body()
        if not raw:
            raise ValueError("Empty request body")
        return json.loads(raw)

    def _send_json(self, status: int, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(self, status: int, data: bytes, content_type: str, disposition: str | None = None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if disposition:
            self.send_header("Content-Disposition", disposition)
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_HEAD(self):
        path = self.path.split("?")[0]
        if path.startswith("/dev-blobs/"):
            bid = path[len("/dev-blobs/"):]
            fpath = os.path.join(UPLOAD_DIR, bid)
            if not os.path.exists(fpath):
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Length", str(os.path.getsize(fpath)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path.startswith("/dev-blobs/"):
            bid = path[len("/dev-blobs/"):]
            fpath = os.path.join(UPLOAD_DIR, bid)
            if not os.path.exists(fpath):
                return self._send_json(404, {"error": "Blob not found"})
            data = open(fpath, "rb").read()
            ct = BLOBS.get(bid, {}).get("content_type", "application/octet-stream")
            return self._send_bytes(200, data, ct)

        if path == "/api/colour-mapping":
            base_map = load_colour_mapping()
            return self._send_json(200, {"rows": [] if base_map is None else base_map.to_dict(orient="records")})

        if path == "/api/gads-constants":
            countries, languages = load_gads_constants()
            if countries is not None:
                countries = countries.rename(columns={"id": "criteriaId", "country_code": "countryCode"})
                country_rows = countries[["criteriaId", "name", "countryCode"]].to_dict(orient="records")
            else:
                country_rows = []
            if languages is not None:
                languages = languages.rename(columns={"id": "languageId"})
                language_rows = languages[["languageId", "name"]].to_dict(orient="records")
            else:
                language_rows = []
            return self._send_json(200, {"countries": country_rows, "languages": language_rows})

        if path == "/api/bubble-data":
            try:
                raw_df = _load_blob_df(query.get("rawDfUrl", [""])[0])
                n = max(1, int(query.get("n", ["500"])[0]))
                group_col = query.get("groupCol", [None])[0]

                # Build processed df so extracted category columns are available
                state_json = query.get("state", [None])[0]
                state = _parse_state(state_json)
                processed = _get_processed_df(raw_df, state) if state else raw_df.copy()

                clicks_col = _find_clicks_col(processed)
                title_col = next(
                    (c for c in processed.columns if norm(c) == norm("title")),
                    processed.columns[0] if len(processed.columns) else None,
                )
                nums = (
                    pd.to_numeric(processed[clicks_col].astype(str).str.extract(r"([\d.]+)")[0], errors="coerce").fillna(0)
                    if clicks_col else pd.Series(0.0, index=processed.index)
                )
                bubble_df = processed.copy()
                bubble_df["_clicks"] = nums
                bubble_df = bubble_df.sort_values("_clicks", ascending=False).head(n).reset_index(drop=True)

                items = [
                    {
                        "title": str(row.get(title_col, "")) if title_col else "",
                        "clicks": float(row.get("_clicks", 0) or 0),
                        "category": str(row.get(group_col, "")).strip() if group_col and group_col in bubble_df.columns else "",
                    }
                    for _, row in bubble_df.iterrows()
                ]

                # Available grouping columns: categorical columns with 2–50 unique values
                group_candidates = [
                    c for c in processed.columns
                    if 2 <= int(processed[c].astype(str).str.strip().replace("", pd.NA).dropna().nunique()) <= 50
                    and c not in {"_clicks", title_col}
                ]

                return self._send_json(200, {
                    "items": items,
                    "total": len(raw_df),
                    "groupCandidates": group_candidates,
                })
            except Exception as e:
                return self._send_json(500, {"error": str(e)})

        if path == "/api/download":
            try:
                export_type = query.get("type", [""])[0]
                export_format = query.get("format", ["csv"])[0]
                state = _parse_state(query.get("state", [None])[0])
                raw_df_url = query.get("rawDfUrl", [None])[0]
                combined_df_url = query.get("combinedDfUrl", [None])[0]
                gads_df_url = query.get("gadsDfBlobUrl", [None])[0]
                content_type = "text/csv" if export_format == "csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

                if export_type == "normalised":
                    raw_df = _load_blob_df(raw_df_url)
                    df = _get_processed_df(raw_df, {**state, "rawDfUrl": raw_df_url})
                    data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Normalised Feed")
                    name = f"normalised_feed.{export_format}"
                elif export_type == "keywords-combined":
                    df = _load_blob_df(combined_df_url)
                    data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Combined Keywords")
                    name = f"keywords_combined.{export_format}"
                elif export_type == "gads-metrics":
                    combined_df = _load_blob_df(combined_df_url)
                    gads_df = _load_blob_df(gads_df_url)
                    df = compute_opportunity(combined_df, gads_df)
                    data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Keywords + Metrics")
                    name = f"keywords_with_gads_metrics.{export_format}"
                elif export_type == "sales-opportunity":
                    combined_df = _load_blob_df(combined_df_url)
                    gads_df = _load_blob_df(gads_df_url)
                    df = compute_sales_opportunity(compute_opportunity(combined_df, gads_df))
                    data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Sales Opportunity")
                    name = f"sales_opportunity.{export_format}"
                else:
                    raw_df = _load_blob_df(raw_df_url)
                    data = to_csv_bytes(raw_df) if export_format == "csv" else to_xlsx_bytes(raw_df, sheet_name="Source Feed")
                    name = f"source_feed.{export_format}"

                return self._send_bytes(200, data, content_type, f'attachment; filename="{name}"')
            except Exception as e:
                return self._send_json(500, {"error": str(e)})

        self._send_json(501, {"error": f"Not implemented: {path}"})

    def do_PUT(self):
        path = self.path.split("?")[0]
        if not path.startswith("/dev-blobs/"):
            return self._send_json(404, {"error": "Not found"})
        bid = path[len("/dev-blobs/"):]
        data = self._body()
        with open(os.path.join(UPLOAD_DIR, bid), "wb") as handle:
            handle.write(data)
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

    def do_POST(self):
        path = self.path.split("?")[0]
        try:
            if path == "/api/blob-token":
                return self._handle_blob_token()
            if path == "/api/parse":
                return self._handle_parse()
            if path == "/api/columns":
                return self._handle_columns()
            if path == "/api/filters":
                return self._handle_filters()
            if path == "/api/groups":
                return self._handle_groups()
            if path == "/api/colour-summary":
                return self._handle_colour_summary()
            if path == "/api/colour-mapping":
                return self._handle_colour_mapping()
            if path == "/api/categories":
                return self._handle_categories()
            if path == "/api/normalised-feed":
                return self._handle_normalised_feed()
            if path == "/api/keywords":
                return self._handle_keywords()
            if path == "/api/keywords-finalise":
                return self._handle_keywords_finalise()
            if path == "/api/gads-fetch":
                return self._handle_gads_fetch()
            if path == "/api/gads-upload":
                return self._handle_gads_upload()
            if path == "/api/gads-results":
                return self._handle_gads_results()
            if path == "/api/gads-charts":
                return self._handle_gads_charts()
        except Exception as e:
            return self._send_json(500, {"error": str(e)})
        self._send_json(501, {"error": f"Not implemented: {path}"})

    def _handle_blob_token(self):
        body = self._json_body()
        bid = str(uuid.uuid4())
        BLOBS[bid] = {
            "filename": body.get("filename", "upload"),
            "content_type": body.get("contentType", "application/octet-stream"),
        }
        url = _blob_url(bid)
        self._send_json(200, {"uploadUrl": url, "url": url})

    def _handle_parse(self):
        body = self._json_body()
        blob_url = body["blobUrl"]
        filename = body.get("filename", "file")
        bid = blob_url.rstrip("/").split("/")[-1]
        fpath = os.path.join(UPLOAD_DIR, bid)
        if not os.path.exists(fpath):
            return self._send_json(400, {"error": f"Upload not found: {bid}"})
        df, resolved_name = _read_file(fpath, filename)
        df = derive_age_gender_segment(df)
        keep_map = default_keep_map(df)
        raw_url = _save_blob_df(df, "raw")
        file_hash = hashlib.md5(open(fpath, "rb").read()).hexdigest()
        self._send_json(200, {
            "columns": _column_meta(df, keep_map),
            "productCount": count_products(df),
            "fileName": resolved_name,
            "sheetName": None,
            "sheets": None,
            "rawDfBlobUrl": raw_url,
            "fileHash": file_hash,
            "catSrcCol": preferred_category_column(df),
        })

    def _handle_columns(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        action = body.get("action")
        if action == "recommended":
            n2o = {norm(c): c for c in raw_df.columns}
            keep_map = {c: False for c in raw_df.columns}
            for item in {norm(x) for x in RECOMMENDED_RAW}:
                if item in n2o:
                    keep_map[n2o[item]] = True
        elif action == "all":
            keep_map = {c: True for c in raw_df.columns}
        elif action == "none":
            keep_map = {c: False for c in raw_df.columns}
        elif action == "invert":
            old = body.get("keepMap", {})
            keep_map = {c: not old.get(c, False) for c in raw_df.columns}
        else:
            keep_map = body.get("keepMap", {})
        kept = apply_column_selection(raw_df, keep_map)
        self._send_json(200, {
            "keepMap": keep_map,
            "columns": _column_meta(raw_df, keep_map),
            "preview": _records(_clicks_sorted_preview(raw_df, kept)),
            "rowCount": len(kept),
            "colCount": len(kept.columns),
        })

    def _handle_filters(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        kept = apply_column_selection(raw_df, body.get("keepMap", {}))
        filters = body.get("filters", {})
        numeric_filters = body.get("numericFilters", {})
        # Exclude numeric columns from checkbox-style options
        num_opts = numeric_filter_options(kept)
        num_cols = set(num_opts.keys())
        filtered = apply_filters(kept, filters)
        filtered = apply_numeric_filters(filtered, numeric_filters)
        self._send_json(200, {
            "options": {k: v for k, v in filter_options(kept).items() if k not in num_cols},
            "numericOptions": num_opts,
            "filteredCount": len(filtered),
            "totalCount": len(kept),
            "preview": _records(_clicks_sorted_preview(raw_df, filtered)),
        })

    def _handle_groups(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        raw_filtered = apply_filters(raw_df, body.get("filters", {}))
        candidates = group_candidates(raw_filtered)
        if not candidates:
            return self._send_json(200, {"candidates": [], "groupCol": "", "rollup": [], "stats": []})
        stats = compute_group_stats(raw_filtered, candidates)
        group_col = body.get("groupCol") if body.get("groupCol") in candidates else candidates[0]
        grouped = apply_grouping(raw_filtered, group_col, stats)
        rollup = format_rollup(feed_label_rollup(grouped))
        self._send_json(200, {
            "candidates": candidates,
            "groupCol": group_col,
            "rollup": rollup.fillna("").astype(object).to_dict(orient="records"),
            "stats": [
                {"column": c, "groupCount": stats[c]["group_count"], "skuCount": stats[c]["sku_count"]}
                for c in candidates
            ],
        })

    def _handle_colour_summary(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        kept = apply_column_selection(raw_df, body.get("keepMap", {}))
        filtered = apply_filters(kept, body.get("filters", {}))
        candidates = detect_colour_columns(filtered)
        if not candidates:
            return self._send_json(200, {"colourCandidates": [], "colourCol": "", "valueCounts": [], "nonEmpty": 0})
        colour_col = body.get("colourCol") if body.get("colourCol") in candidates else candidates[0]
        vc, non_empty = colour_summary(filtered, colour_col)
        self._send_json(200, {
            "colourCandidates": candidates,
            "colourCol": colour_col,
            "valueCounts": [
                {"colour": row["Colour"], "productCount": int(row["Product Count"]), "pct": row["% of Products"]}
                for _, row in vc.iterrows()
            ],
            "nonEmpty": non_empty,
        })

    def _handle_colour_mapping(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        kept = apply_column_selection(raw_df, body.get("keepMap", {}))
        filtered = apply_filters(kept, body.get("filters", {}))
        colour_col = body.get("colourCol")
        base_map = load_colour_mapping()
        if base_map is None or not colour_col or colour_col not in filtered.columns:
            return self._send_json(400, {"error": "Colour mapping unavailable"})
        overrides = body.get("overrides", [])
        new_rows = pd.DataFrame(
            [
                {"product_colour": r["productColour"].strip().lower(), "generic_colour": r["genericColour"].strip().lower()}
                for r in overrides if r.get("productColour") and r.get("genericColour")
            ]
        )
        updated_map = merge_new_mappings(base_map, new_rows.drop_duplicates(subset=["product_colour"])) if not new_rows.empty else base_map.copy()
        colour_map_url = _save_blob_df(updated_map, "colour_map")
        currently_mapped, newly_mapped, unmapped_count, eligible_count, pct_mapped, *_ = mapping_breakdown(
            filtered, colour_col, base_map, updated_map
        )
        allowed_generic = sorted(updated_map["generic_colour"].dropna().unique().tolist())
        unmapped = add_suggestions(unmapped_colours(filtered, colour_col, updated_map), allowed_generic)
        self._send_json(200, {
            "colourMapBlobUrl": colour_map_url,
            "breakdown": {
                "currentlyMapped": currently_mapped,
                "newlyMapped": newly_mapped,
                "unmapped": unmapped_count,
                "eligible": eligible_count,
                "pctMapped": pct_mapped,
            },
            "unmapped": [
                {"productColour": row["Unmapped Colour"], "suggestion": row.get("Suggestion", ""), "productCount": int(row["Product Count"])}
                for _, row in unmapped.iterrows()
            ],
            "allowedGeneric": allowed_generic,
        })

    def _handle_categories(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        kept = apply_column_selection(raw_df, body.get("keepMap", {}))
        filtered = apply_filters(kept, body.get("filters", {}))
        default_src = preferred_category_column(filtered)
        cat_src_col = body.get("catSrcCol") if body.get("catSrcCol") in filtered.columns else default_src
        preview_df = extract_categories(
            filtered,
            cat_src_col,
            bool(body.get("wantMain")),
            bool(body.get("wantPenultimate")),
            bool(body.get("wantFinal")),
        )
        extracted_cols = [c for c in ["Main Category", "Penultimate Category", "Final Category"] if c in preview_df.columns]
        preview_cols = [cat_src_col] + extracted_cols

        # Always show distinct category combinations with product counts
        dedup = (
            preview_df[preview_cols]
            .assign(_count=1)
            .groupby(preview_cols, as_index=False)
            .agg(_count=("_count", "sum"))
            .rename(columns={"_count": "Product Count"})
            .sort_values("Product Count", ascending=False)
        )
        preview_rows = dedup.head(PREVIEW_ROWS).fillna("").astype(object).to_dict(orient="records")

        self._send_json(200, {
            "preview": preview_rows,
            "allCols": list(filtered.columns),
            "catSrcCol": cat_src_col,
        })

    def _handle_normalised_feed(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        params = {**body.get("state", {}), "colourMapBlobUrl": body.get("colourMapBlobUrl")}
        df = _get_processed_df(raw_df, params)
        self._send_json(200, {
            "preview": _records(df),
            "rowCount": len(df),
            "colCount": len(df.columns),
        })

    def _handle_keywords(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        params = {**body.get("state", {}), "colourMapBlobUrl": body.get("colourMapBlobUrl")}
        processed = _get_processed_df(raw_df, params)
        combos = body.get("combos", [])
        if body.get("presets"):
            combos = _build_preset_combos(processed)
        per_list_tables = []
        all_cols = list(processed.columns)
        for i, combo in enumerate(combos):
            fields = [f for f in combo.get("fields", []) if f in all_cols]
            table = make_keywords(processed, fields, bool(combo.get("splitAmpersand", False)))
            list_name = combo.get("name") or f"List {i + 1}"
            display_cols = [c for c in table.columns if c != "Clicks Monthly Est"]
            per_list_tables.append({
                "listName": list_name,
                "rows": _records(table),
                "displayCols": display_cols,
            })
        self._send_json(200, {"combos": combos, "perListTables": per_list_tables})

    def _handle_keywords_finalise(self):
        body = self._json_body()
        raw_df = _load_blob_df(body["rawDfUrl"])
        params = {**body.get("state", {}), "colourMapBlobUrl": body.get("colourMapBlobUrl")}
        processed = _get_processed_df(raw_df, params)
        combined_tables = []
        for i, combo in enumerate(body.get("combos", [])):
            fields = [f for f in combo.get("fields", []) if f in processed.columns]
            table = make_keywords(processed, fields, bool(combo.get("splitAmpersand", False)))
            list_name = combo.get("name") or f"List {i + 1}"
            if not table.empty:
                table.insert(0, "list_name", list_name)
                combined_tables.append(table)
        combined = pd.concat(combined_tables, ignore_index=True) if combined_tables else pd.DataFrame()
        combined_url = _save_blob_df(combined, "combined_keywords")
        self._send_json(200, {
            "combinedDfBlobUrl": combined_url,
            "preview": _records(combined),
            "totalKeywords": len(combined),
        })

    def _handle_gads_fetch(self):
        body = self._json_body()
        combined_df_url = body.get("combinedDfBlobUrl")
        geo_ids = body.get("geoIds", ["2826"])  # default UK
        language_id = body.get("languageId", "1000")  # default English

        if not combined_df_url:
            return self._send_json(400, {"error": "No combined keyword list found. Build your keyword lists first."})

        combined_df = _load_blob_df(combined_df_url)
        if "keyword_norm" not in combined_df.columns and "keyword" not in combined_df.columns:
            return self._send_json(400, {"error": "Combined keyword list has no keyword column."})

        kw_col = "keyword_norm" if "keyword_norm" in combined_df.columns else "keyword"
        keywords = combined_df[kw_col].dropna().astype(str).str.strip().unique().tolist()
        keywords = [k for k in keywords if k]

        if not keywords:
            return self._send_json(400, {"error": "No keywords to fetch volumes for."})

        config = {
            "GOOGLE_ADS_DEVELOPER_TOKEN": os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN"),
            "GOOGLE_ADS_CLIENT_ID": os.environ.get("GOOGLE_ADS_CLIENT_ID"),
            "GOOGLE_ADS_CLIENT_SECRET": os.environ.get("GOOGLE_ADS_CLIENT_SECRET"),
            "GOOGLE_ADS_REFRESH_TOKEN": os.environ.get("GOOGLE_ADS_REFRESH_TOKEN"),
            "GOOGLE_ADS_LOGIN_CUSTOMER_ID": os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID"),
        }

        try:
            client, customer_id = get_gads_client_and_customer_id(config)
        except Exception as e:
            return self._send_json(500, {"error": f"Google Ads credentials error: {e}"})

        try:
            gads_df, _ = fetch_historical_metrics_gads(
                client,
                customer_id,
                keywords,
                geo_ids,
                language_id,
            )
        except Exception as e:
            return self._send_json(500, {"error": f"Google Ads API error: {e}"})

        gads_url = _save_blob_df(gads_df, "gads_metrics")
        self._send_json(200, {
            "gadsDfBlobUrl": gads_url,
            "preview": _records(gads_df),
            "rowCount": len(gads_df),
        })

    def _handle_gads_upload(self):
        body = self._json_body()
        blob_url = body["blobUrl"]
        filename = body.get("filename", "gads.csv")
        bid = blob_url.rstrip("/").split("/")[-1]
        fpath = os.path.join(UPLOAD_DIR, bid)
        if not os.path.exists(fpath):
            return self._send_json(400, {"error": f"Upload not found: {bid}"})
        df, _ = _read_file(fpath, filename)
        if "keyword_norm" not in df.columns:
            if "keyword" in df.columns:
                df["keyword_norm"] = df["keyword"].astype(str).str.strip().str.lower()
            elif "canonical_keyword" in df.columns:
                df["keyword_norm"] = df["canonical_keyword"].astype(str).str.strip().str.lower()
        for column in ["avg_monthly_searches", "competition_index", "year", "month", "monthly_searches"]:
            if column in df.columns:
                df[column] = pd.to_numeric(df[column], errors="coerce")
        gads_url = _save_blob_df(df, "gads_metrics")
        self._send_json(200, {
            "gadsDfBlobUrl": gads_url,
            "preview": _records(df),
            "rowCount": len(df),
        })

    def _handle_gads_results(self):
        body = self._json_body()
        combined_df = _load_blob_df(body["combinedDfBlobUrl"])
        gads_df = _load_blob_df(body["gadsDfBlobUrl"])
        final_view = compute_opportunity(combined_df, gads_df)
        self._send_json(200, {
            "hasResults": not final_view.empty,
            "preview": _records(final_view),
            "totalRows": len(final_view),
            "keywordsWithVolume": int(final_view["monthly_searches"].notna().sum()) if "monthly_searches" in final_view.columns else 0,
        })

    def _handle_gads_charts(self):
        body = self._json_body()
        combined_df = _load_blob_df(body["combinedDfBlobUrl"])
        gads_df = _load_blob_df(body["gadsDfBlobUrl"])
        fv, totals = build_chart_data(combined_df, gads_df)
        if fv is None or totals is None or totals.empty:
            return self._send_json(200, {"chronologicalSpec": {}, "seasonalitySpec": {}})
        all_lists = totals["list_name"].tolist()
        self._send_json(200, {
            "chronologicalSpec": chronological_spec(fv, all_lists, all_lists),
            "seasonalitySpec": seasonality_spec(fv, all_lists, all_lists),
        })


if __name__ == "__main__":
    print(f"Dev API server: http://{HOST}:{PORT}")
    print(f"Uploads dir:    {UPLOAD_DIR}")
    print()
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
