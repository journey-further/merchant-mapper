from api._lib.blob_io import load_df
from api._lib.core.keyword_builder import make_keywords
from api._lib.handler_utils import BaseHandler, build_preset_combos, get_processed_df, records


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
            params = {**body.get("state", {}), "colourMapBlobUrl": body.get("colourMapBlobUrl")}
            processed = get_processed_df(raw_df, params)
            combos = body.get("combos", [])
            if body.get("presets"):
                combos = build_preset_combos(processed)

            all_cols = list(processed.columns)
            per_list_tables = []
            for i, combo in enumerate(combos):
                fields = [f for f in combo.get("fields", []) if f in all_cols]
                table = make_keywords(processed, fields, bool(combo.get("splitAmpersand", False)))
                list_name = combo.get("name") or f"List {i + 1}"
                display_cols = [c for c in table.columns if c != "Clicks Monthly Est"]
                per_list_tables.append({"listName": list_name, "rows": records(table), "displayCols": display_cols})

            self._send_json(200, {"combos": combos, "perListTables": per_list_tables})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
