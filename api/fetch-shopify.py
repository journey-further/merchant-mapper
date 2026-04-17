import hashlib

from api._lib.blob_io import save_df
from api._lib.core.category_extraction import preferred_category_column
from api._lib.core.feed_processor import count_products
from api._lib.core.shopify_fetcher import fetch_shopify_products, shopify_keep_map
from api._lib.handler_utils import BaseHandler, column_meta


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            store_url = body.get("storeUrl", "").strip()
            if not store_url:
                return self._send_json(400, {"error": "storeUrl is required"})

            df = fetch_shopify_products(store_url)
            keep_map = shopify_keep_map(df)
            raw_url = save_df(df, "shopify_raw")
            file_hash = hashlib.md5(store_url.encode()).hexdigest()
            display_name = store_url.replace("https://", "").replace("http://", "").rstrip("/")

            self._send_json(200, {
                "columns": column_meta(df, keep_map),
                "productCount": count_products(df),
                "fileName": display_name,
                "sheetName": None,
                "sheets": None,
                "rawDfBlobUrl": raw_url,
                "fileHash": file_hash,
                "catSrcCol": preferred_category_column(df),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
