from api._lib.blob_io import load_df
from api._lib.core.feed_processor import (
    RECOMMENDED_RAW,
    apply_column_selection,
    default_keep_map,
)
from api._lib.core.utils import norm
from api._lib.handler_utils import BaseHandler, clicks_sorted_preview, column_meta, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
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
                keep_map = body.get("keepMap", default_keep_map(raw_df))

            kept = apply_column_selection(raw_df, keep_map)
            self._send_json(200, {
                "keepMap": keep_map,
                "columns": column_meta(raw_df, keep_map),
                "preview": records(clicks_sorted_preview(raw_df, kept)),
                "rowCount": len(kept),
                "colCount": len(kept.columns),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
