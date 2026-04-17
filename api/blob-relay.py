"""Client upload relay: receives raw file bytes, stores in Vercel Blob, returns {url}."""
from urllib.parse import parse_qs, urlparse

from api._lib.blob_io import upload_bytes
from api._lib.handler_utils import BaseHandler


class handler(BaseHandler):
    def do_PUT(self):
        try:
            qs = parse_qs(urlparse(self.path).query)
            filename = qs.get("name", ["upload"])[0]
            content_type = self.headers.get("Content-Type", "application/octet-stream")
            data = self._body()
            url = upload_bytes(data, filename, content_type)
            self._send_json(200, {"url": url})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
