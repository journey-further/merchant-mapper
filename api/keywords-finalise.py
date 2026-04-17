import pandas as pd

from api._lib.blob_io import load_df, save_df
from api._lib.core.keyword_builder import make_keywords
from api._lib.handler_utils import BaseHandler, get_processed_df, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
            params = {**body.get("state", {}), "colourMapBlobUrl": body.get("colourMapBlobUrl")}
            processed = get_processed_df(raw_df, params)

            combined_tables = []
            for i, combo in enumerate(body.get("combos", [])):
                fields = [f for f in combo.get("fields", []) if f in processed.columns]
                table = make_keywords(processed, fields, bool(combo.get("splitAmpersand", False)))
                list_name = combo.get("name") or f"List {i + 1}"
                if not table.empty:
                    table.insert(0, "list_name", list_name)
                    combined_tables.append(table)

            combined = pd.concat(combined_tables, ignore_index=True) if combined_tables else pd.DataFrame()
            combined_url = save_df(combined, "combined_keywords")

            self._send_json(200, {
                "combinedDfBlobUrl": combined_url,
                "preview": records(combined),
                "totalKeywords": len(combined),
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
