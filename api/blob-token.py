from urllib.parse import quote

from api._lib.handler_utils import BaseHandler


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            filename = quote(body.get("filename", "upload"), safe="")
            # blob-relay.py receives the raw bytes, uploads to Vercel Blob,
            # and returns {url} — blobUpload.ts reads the response JSON.
            relay_url = f"/api/blob-relay?name={filename}"
            self._send_json(200, {"uploadUrl": relay_url, "url": "pending"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
