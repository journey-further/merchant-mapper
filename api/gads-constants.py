from api._lib.core.gads_client import load_gads_constants
from api._lib.handler_utils import BaseHandler


class handler(BaseHandler):
    def do_GET(self):
        try:
            countries, languages = load_gads_constants()
            if countries is not None:
                countries = countries.rename(columns={"id": "criteriaId", "country_code": "countryCode"})
                country_rows = countries[["criteriaId", "name", "countryCode"]].to_dict(orient="records")
            else:
                country_rows = []
            if languages is not None:
                languages = languages.rename(columns={"id": "languageId"})
                language_rows = languages[["languageId", "name"]].to_dict(orient="records")
            else:
                language_rows = []

            self._send_json(200, {"countries": country_rows, "languages": language_rows})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
