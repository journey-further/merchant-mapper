from api._lib.blob_io import load_df
from api._lib.core.chart_data import build_chart_data, chronological_spec, seasonality_spec
from api._lib.handler_utils import BaseHandler


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            combined_df = load_df(body["combinedDfBlobUrl"])
            gads_df = load_df(body["gadsDfBlobUrl"])
            fv, totals = build_chart_data(combined_df, gads_df)

            if fv is None or totals is None or totals.empty:
                return self._send_json(200, {"chronologicalSpec": {}, "seasonalitySpec": {}})

            all_lists = totals["list_name"].tolist()
            self._send_json(200, {
                "chronologicalSpec": chronological_spec(fv, all_lists, all_lists),
                "seasonalitySpec": seasonality_spec(fv, all_lists, all_lists),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
