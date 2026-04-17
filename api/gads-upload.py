import io

import pandas as pd
import requests

from api._lib.blob_io import save_df
from api._lib.core.feed_loader import load_feed
from api._lib.handler_utils import BaseHandler, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            blob_url = body["blobUrl"]
            filename = body.get("filename", "gads.csv")

            resp = requests.get(blob_url, timeout=60)
            resp.raise_for_status()
            df = load_feed(resp.content, filename)

            if "keyword_norm" not in df.columns:
                if "keyword" in df.columns:
                    df["keyword_norm"] = df["keyword"].astype(str).str.strip().str.lower()
                elif "canonical_keyword" in df.columns:
                    df["keyword_norm"] = df["canonical_keyword"].astype(str).str.strip().str.lower()

            for col in ["avg_monthly_searches", "competition_index", "year", "month", "monthly_searches"]:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")

            gads_url = save_df(df, "gads_metrics")
            self._send_json(200, {
                "gadsDfBlobUrl": gads_url,
                "preview": records(df),
                "rowCount": len(df),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
