import pandas as pd

from api._lib.blob_io import load_df, save_df
from api._lib.core.colour_mapping import (
    add_suggestions,
    load_colour_mapping,
    mapping_breakdown,
    merge_new_mappings,
    unmapped_colours,
)
from api._lib.core.feed_processor import apply_column_selection, apply_filters
from api._lib.handler_utils import BaseHandler


class handler(BaseHandler):
    def do_GET(self):
        try:
            base_map = load_colour_mapping()
            self._send_json(200, {"rows": [] if base_map is None else base_map.to_dict(orient="records")})
        except Exception as e:
            self._send_json(500, {"error": str(e)})

    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
            kept = apply_column_selection(raw_df, body.get("keepMap", {}))
            filtered = apply_filters(kept, body.get("filters", {}))
            colour_col = body.get("colourCol")
            base_map = load_colour_mapping()

            if base_map is None or not colour_col or colour_col not in filtered.columns:
                return self._send_json(400, {"error": "Colour mapping unavailable"})

            overrides = body.get("overrides", [])
            new_rows = pd.DataFrame([
                {
                    "product_colour": r["productColour"].strip().lower(),
                    "generic_colour": r["genericColour"].strip().lower(),
                }
                for r in overrides if r.get("productColour") and r.get("genericColour")
            ])
            updated_map = (
                merge_new_mappings(base_map, new_rows.drop_duplicates(subset=["product_colour"]))
                if not new_rows.empty
                else base_map.copy()
            )
            colour_map_url = save_df(updated_map, "colour_map")

            currently_mapped, newly_mapped, unmapped_count, eligible_count, pct_mapped, *_ = mapping_breakdown(
                filtered, colour_col, base_map, updated_map
            )
            allowed_generic = sorted(updated_map["generic_colour"].dropna().unique().tolist())
            unmapped = add_suggestions(unmapped_colours(filtered, colour_col, updated_map), allowed_generic)

            self._send_json(200, {
                "colourMapBlobUrl": colour_map_url,
                "breakdown": {
                    "currentlyMapped": currently_mapped,
                    "newlyMapped": newly_mapped,
                    "unmapped": unmapped_count,
                    "eligible": eligible_count,
                    "pctMapped": pct_mapped,
                },
                "unmapped": [
                    {
                        "productColour": row["Unmapped Colour"],
                        "suggestion": row.get("Suggestion", ""),
                        "productCount": int(row["Product Count"]),
                    }
                    for _, row in unmapped.iterrows()
                ],
                "allowedGeneric": allowed_generic,
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
