import json
from urllib.parse import parse_qs, urlparse

from api._lib.blob_io import load_df
from api._lib.core.exporters import to_csv_bytes, to_xlsx_bytes
from api._lib.core.gads_opportunity import compute_opportunity, compute_sales_opportunity
from api._lib.handler_utils import BaseHandler, get_processed_df


class handler(BaseHandler):
    def do_GET(self):
        try:
            qs = parse_qs(urlparse(self.path).query)
            export_type = qs.get("type", [""])[0]
            export_format = qs.get("format", ["csv"])[0]
            state_raw = qs.get("state", [None])[0]
            state = json.loads(state_raw) if state_raw else {}
            raw_df_url = qs.get("rawDfUrl", [None])[0]
            combined_df_url = qs.get("combinedDfUrl", [None])[0]
            gads_df_url = qs.get("gadsDfBlobUrl", [None])[0]

            content_type = (
                "text/csv"
                if export_format == "csv"
                else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )

            if export_type == "normalised":
                raw_df = load_df(raw_df_url)
                df = get_processed_df(raw_df, {**state, "rawDfUrl": raw_df_url})
                data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Normalised Feed")
                name = f"normalised_feed.{export_format}"
            elif export_type == "keywords-combined":
                df = load_df(combined_df_url)
                data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Combined Keywords")
                name = f"keywords_combined.{export_format}"
            elif export_type == "gads-metrics":
                combined_df = load_df(combined_df_url)
                gads_df = load_df(gads_df_url)
                df = compute_opportunity(combined_df, gads_df)
                data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Keywords + Metrics")
                name = f"keywords_with_gads_metrics.{export_format}"
            elif export_type == "sales-opportunity":
                combined_df = load_df(combined_df_url)
                gads_df = load_df(gads_df_url)
                df = compute_sales_opportunity(compute_opportunity(combined_df, gads_df))
                data = to_csv_bytes(df) if export_format == "csv" else to_xlsx_bytes(df, sheet_name="Sales Opportunity")
                name = f"sales_opportunity.{export_format}"
            else:
                raw_df = load_df(raw_df_url)
                data = to_csv_bytes(raw_df) if export_format == "csv" else to_xlsx_bytes(raw_df, sheet_name="Source Feed")
                name = f"source_feed.{export_format}"

            self._send_bytes(200, data, content_type, f'attachment; filename="{name}"')
        except Exception as e:
            self._send_json(500, {"error": str(e)})
