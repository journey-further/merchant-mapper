from api._lib.blob_io import load_df
from api._lib.core.colour_mapping import colour_summary, detect_colour_columns
from api._lib.core.feed_processor import apply_column_selection, apply_filters
from api._lib.handler_utils import BaseHandler


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
            kept = apply_column_selection(raw_df, body.get("keepMap", {}))
            filtered = apply_filters(kept, body.get("filters", {}))
            candidates = detect_colour_columns(filtered)

            if not candidates:
                return self._send_json(200, {
                    "colourCandidates": [], "colourCol": "", "valueCounts": [], "nonEmpty": 0
                })

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
        except Exception as e:
            self._send_json(500, {"error": str(e)})
