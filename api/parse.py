import hashlib

import requests

from api._lib.blob_io import load_df, save_df
from api._lib.core.category_extraction import preferred_category_column
from api._lib.core.feed_loader import load_feed
from api._lib.core.feed_processor import count_products, default_keep_map, derive_age_gender_segment
from api._lib.handler_utils import BaseHandler, column_meta


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            blob_url = body["blobUrl"]
            filename = body.get("filename", "file")

            resp = requests.get(blob_url, timeout=60)
            resp.raise_for_status()
            file_bytes = resp.content

            df = load_feed(file_bytes, filename)
            df = derive_age_gender_segment(df)
            keep_map = default_keep_map(df)
            raw_url = save_df(df, "raw")
            file_hash = hashlib.md5(file_bytes).hexdigest()

            self._send_json(200, {
                "columns": column_meta(df, keep_map),
                "productCount": count_products(df),
                "fileName": filename,
                "sheetName": None,
                "sheets": None,
                "rawDfBlobUrl": raw_url,
                "fileHash": file_hash,
                "catSrcCol": preferred_category_column(df),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
