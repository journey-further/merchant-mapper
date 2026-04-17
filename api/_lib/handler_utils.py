"""Shared utilities for Vercel Python handlers."""
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler
from typing import Any

import pandas as pd

from api._lib.blob_io import load_df
from api._lib.core.category_extraction import extract_categories
from api._lib.core.colour_mapping import apply_colour_mapping, load_colour_mapping
from api._lib.core.feed_processor import (
    apply_column_selection,
    apply_filters,
    split_price_columns,
)
from api._lib.core.product_groups import (
    apply_grouping,
    compute_group_stats,
    group_candidates,
)
from api._lib.core.utils import norm

PREVIEW_ROWS = 100


def find_clicks_col(df: pd.DataFrame) -> str | None:
    n2o = {norm(c): c for c in df.columns}
    return (
        n2o.get(norm("all clicks"))
        or n2o.get(norm("all_clicks"))
        or n2o.get(norm("28 day clicks"))
        or n2o.get(norm("clicks"))
    )


def clicks_sorted_preview(
    raw_df: pd.DataFrame, preview_df: pd.DataFrame, limit: int = PREVIEW_ROWS
) -> pd.DataFrame:
    clicks_col = find_clicks_col(raw_df)
    if clicks_col:
        nums = pd.to_numeric(
            raw_df[clicks_col].astype(str).str.extract(r"([\d.]+)")[0], errors="coerce"
        )
        sorted_idx = nums.sort_values(ascending=False, na_position="last").index
        preview_df = preview_df.reindex(sorted_idx)
    return preview_df.head(limit).fillna("")


def column_meta(df: pd.DataFrame, keep_map: dict[str, bool]) -> list[dict]:
    top_idx = None
    clicks_col = find_clicks_col(df)
    if clicks_col:
        nums = pd.to_numeric(
            df[clicks_col].astype(str).str.extract(r"([\d.]+)")[0], errors="coerce"
        )
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
            "example": (
                sample.loc[sample["Column"] == c, "Example"].values[0]
                if c in sample["Column"].values
                else ""
            ),
            "unique": unique_counts[i],
        }
        for i, c in enumerate(df.columns)
    ]


def records(df: pd.DataFrame, limit: int = PREVIEW_ROWS) -> list[dict]:
    return df.head(limit).fillna("").astype(object).to_dict(orient="records")


def get_processed_df(raw_df: pd.DataFrame, params: dict) -> pd.DataFrame:
    keep_map = params.get("keepMap", {})
    filters = params.get("filters", {})
    group_col = params.get("groupCol")
    colour_col = params.get("colourCol")
    cat_src_col = params.get("catSrcCol")
    want_main = bool(params.get("wantMain"))
    want_penultimate = bool(params.get("wantPenultimate"))
    want_final = bool(params.get("wantFinal"))

    colour_map_url = params.get("colourMapBlobUrl")
    colour_map_df = None
    if colour_map_url:
        try:
            colour_map_df = load_df(colour_map_url)
        except Exception:
            pass
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

    if (
        colour_col
        and colour_col in raw_filtered.columns
        and colour_map_df is not None
        and not colour_map_df.empty
    ):
        mapped = (
            apply_colour_mapping(raw_filtered, colour_col, colour_map_df)["generic_colour"]
            .reindex(df.index)
            .fillna("")
        )
        generic_like = [
            c for c in df.columns
            if c.strip().lower() in {"generic_colour", "generic colour", "normalised colour"}
        ]
        if generic_like:
            df = df.drop(columns=generic_like, errors="ignore")
        df["Normalised Colour"] = mapped

    if cat_src_col and cat_src_col in df.columns:
        df = extract_categories(df, cat_src_col, want_main, want_penultimate, want_final)

    df = split_price_columns(df)
    return df


def build_preset_combos(processed_df: pd.DataFrame) -> list[dict]:
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
        combos.append({"name": preset["name"], "fields": fields, "splitAmpersand": preset["splitAmpersand"]})
    return combos or [{"name": "", "fields": [], "splitAmpersand": False}]


class BaseHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _body(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def _json_body(self) -> dict:
        raw = self._body()
        if not raw:
            raise ValueError("Empty request body")
        return json.loads(raw)

    def _send_json(self, status: int, data: Any) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_bytes(
        self, status: int, data: bytes, content_type: str, disposition: str | None = None
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if disposition:
            self.send_header("Content-Disposition", disposition)
        self.end_headers()
        self.wfile.write(data)
