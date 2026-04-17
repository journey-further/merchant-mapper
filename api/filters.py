from api._lib.blob_io import load_df
from api._lib.core.feed_processor import (
    apply_column_selection,
    apply_filters,
    apply_numeric_filters,
    filter_options,
    numeric_filter_options,
)
from api._lib.handler_utils import BaseHandler, clicks_sorted_preview, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
            kept = apply_column_selection(raw_df, body.get("keepMap", {}))
            filters = body.get("filters", {})
            numeric_filters = body.get("numericFilters", {})

            num_opts = numeric_filter_options(kept)
            num_cols = set(num_opts.keys())
            filtered = apply_filters(kept, filters)
            filtered = apply_numeric_filters(filtered, numeric_filters)

            self._send_json(200, {
                "options": {k: v for k, v in filter_options(kept).items() if k not in num_cols},
                "numericOptions": num_opts,
                "filteredCount": len(filtered),
                "totalCount": len(kept),
                "preview": records(clicks_sorted_preview(raw_df, filtered)),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
