from api._lib.blob_io import load_df
from api._lib.core.feed_processor import apply_filters
from api._lib.core.product_groups import (
    apply_grouping,
    compute_group_stats,
    feed_label_rollup,
    format_rollup,
    group_candidates,
)
from api._lib.handler_utils import BaseHandler


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
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
        except Exception as e:
            self._send_json(500, {"error": str(e)})
