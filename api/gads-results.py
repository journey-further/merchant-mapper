from api._lib.blob_io import load_df
from api._lib.core.gads_opportunity import compute_opportunity
from api._lib.handler_utils import BaseHandler, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            combined_df = load_df(body["combinedDfBlobUrl"])
            gads_df = load_df(body["gadsDfBlobUrl"])
            final_view = compute_opportunity(combined_df, gads_df)

            self._send_json(200, {
                "hasResults": not final_view.empty,
                "preview": records(final_view),
                "totalRows": len(final_view),
                "keywordsWithVolume": (
                    int(final_view["monthly_searches"].notna().sum())
                    if "monthly_searches" in final_view.columns
                    else 0
                ),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
