from api._lib.blob_io import load_df
from api._lib.core.category_extraction import extract_categories, preferred_category_column
from api._lib.core.feed_processor import apply_column_selection, apply_filters
from api._lib.handler_utils import BaseHandler, PREVIEW_ROWS


class handler(BaseHandler):
    def do_POST(self):
        try:
            body = self._json_body()
            raw_df = load_df(body["rawDfUrl"])
            kept = apply_column_selection(raw_df, body.get("keepMap", {}))
            filtered = apply_filters(kept, body.get("filters", {}))

            default_src = preferred_category_column(filtered)
            cat_src_col = body.get("catSrcCol") if body.get("catSrcCol") in filtered.columns else default_src

            preview_df = extract_categories(
                filtered,
                cat_src_col,
                bool(body.get("wantMain")),
                bool(body.get("wantPenultimate")),
                bool(body.get("wantFinal")),
            )
            extracted_cols = [
                c for c in ["Main Category", "Penultimate Category", "Final Category"]
                if c in preview_df.columns
            ]
            preview_cols = [cat_src_col] + extracted_cols
            dedup = (
                preview_df[preview_cols]
                .assign(_count=1)
                .groupby(preview_cols, as_index=False)
                .agg(_count=("_count", "sum"))
                .rename(columns={"_count": "Product Count"})
                .sort_values("Product Count", ascending=False)
            )

            self._send_json(200, {
                "preview": dedup.head(PREVIEW_ROWS).fillna("").astype(object).to_dict(orient="records"),
                "allCols": list(filtered.columns),
                "catSrcCol": cat_src_col,
            })
        except Exception as e:
            self._send_json(500, {"error": str(e)})
