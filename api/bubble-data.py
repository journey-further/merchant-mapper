import json
from urllib.parse import parse_qs, urlparse

import pandas as pd

from api._lib.blob_io import load_df
from api._lib.handler_utils import BaseHandler, find_clicks_col, get_processed_df
from api._lib.core.utils import norm


class handler(BaseHandler):
    def do_GET(self):
        try:
            qs = parse_qs(urlparse(self.path).query)
            raw_df = load_df(qs.get("rawDfUrl", [""])[0])
            n = max(1, int(qs.get("n", ["500"])[0]))
            group_col = qs.get("groupCol", [None])[0]

            state_raw = qs.get("state", [None])[0]
            state = json.loads(state_raw) if state_raw else {}
            processed = get_processed_df(raw_df, state) if state else raw_df.copy()

            clicks_col = find_clicks_col(processed)
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
            group_candidates = [
                c for c in processed.columns
                if 2 <= int(processed[c].astype(str).str.strip().replace("", pd.NA).dropna().nunique()) <= 50
                and c not in {"_clicks", title_col}
            ]

            self._send_json(200, {
                "items": items,
                "total": len(raw_df),
                "groupCandidates": group_candidates,
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
