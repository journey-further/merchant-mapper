import os

from api._lib.blob_io import load_df, save_df
from api._lib.core.gads_client import (
    fetch_historical_metrics_gads,
    get_gads_credentials,
)
from api._lib.handler_utils import BaseHandler, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            combined_df_url = body.get("combinedDfBlobUrl")
            if not combined_df_url:
                return self._send_json(400, {"error": "No combined keyword list found. Build your keyword lists first."})

            combined_df = load_df(combined_df_url)
            kw_col = "keyword_norm" if "keyword_norm" in combined_df.columns else "keyword"
            if kw_col not in combined_df.columns:
                return self._send_json(400, {"error": "Combined keyword list has no keyword column."})

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
                creds = get_gads_credentials(config)
            except Exception as e:
                return self._send_json(500, {"error": f"Google Ads credentials error: {e}"})

            geo_ids = body.get("geoIds", ["2826"])
            language_id = body.get("languageId", "1000")

            gads_df, _ = fetch_historical_metrics_gads(creds, creds["customer_id"], keywords, geo_ids, language_id)
            gads_url = save_df(gads_df, "gads_metrics")

            self._send_json(200, {
                "gadsDfBlobUrl": gads_url,
                "preview": records(gads_df),
                "rowCount": len(gads_df),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
