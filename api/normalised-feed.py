from api._lib.blob_io import load_df
from api._lib.handler_utils import BaseHandler, get_processed_df, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
            params = {**body.get("state", {}), "colourMapBlobUrl": body.get("colourMapBlobUrl")}
            df = get_processed_df(raw_df, params)

            self._send_json(200, {
                "preview": records(df),
                "rowCount": len(df),
                "colCount": len(df.columns),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
