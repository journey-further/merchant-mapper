"""Shopify products.json ingestion: fetch, paginate, and flatten to a DataFrame."""
from __future__ import annotations

import json
import re
import urllib.request
import urllib.error
from html.parser import HTMLParser

import pandas as pd

MAX_PAGES = 50
PAGE_SIZE = 250

# Columns to default to "on" in the column picker
RECOMMENDED_SHOPIFY = {
    "title", "id", "item group id", "price", "sale price",
    "availability", "condition", "brand", "product type",
    "color", "size", "material",
    "image link", "additional image link", "link",
    "tags",
}

# Core column names that option values must never overwrite
_CORE_COLUMNS = {
    "id", "item group id", "title", "description", "price", "sale price",
    "availability", "condition", "brand", "product type", "link",
    "image link", "additional image link", "tags",
    "shopify product id", "shopify variant id", "weight kg", "published at",
}

# Option name → normalised column name mapping
_COLOUR_TOKENS = {"colour", "color", "fabric", "finish", "upholstery", "colourway", "colourways"}
_SIZE_TOKENS = {"size", "sizeoption", "sizeoptions", "sizes"}
_MATERIAL_TOKENS = {"material", "materials"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _option_col_name(raw: str) -> str:
    """Map a Shopify option name to a standardised column name."""
    n = _norm(raw)
    if n in _COLOUR_TOKENS or any(tok in n for tok in _COLOUR_TOKENS):
        return "color"
    if n in _SIZE_TOKENS or any(tok in n for tok in _SIZE_TOKENS):
        return "size"
    if n in _MATERIAL_TOKENS or any(tok in n for tok in _MATERIAL_TOKENS):
        return "material"
    return raw.strip().lower()


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        self._chunks.append(data)

    def get_text(self) -> str:
        return re.sub(r"\s+", " ", " ".join(self._chunks)).strip()


def _strip_html(html: str) -> str:
    if not html:
        return ""
    p = _HTMLStripper()
    try:
        p.feed(html)
    except Exception:
        return re.sub(r"<[^>]+>", " ", html).strip()
    return p.get_text()


def _detect_currency(store_url: str) -> str:
    """Infer currency from store domain TLD."""
    host = store_url.lower()
    if ".co.uk" in host or host.endswith(".uk"):
        return "GBP"
    if ".com.au" in host:
        return "AUD"
    if ".ca" in host and ".com" not in host:
        return "CAD"
    if ".eu" in host:
        return "EUR"
    return "USD"


def _fmt_price(raw: str | float | None, currency: str) -> str:
    if not raw and raw != 0:
        return ""
    try:
        n = float(raw)
    except (ValueError, TypeError):
        return ""
    if n <= 0:
        return ""
    return f"{n:.2f} {currency}"


def _normalise_url(store_url: str) -> str:
    url = store_url.strip().rstrip("/")
    if not url.startswith("http"):
        url = "https://" + url
    return url


def _fetch_page(store_url: str, page: int) -> list[dict]:
    url = f"{store_url}/products.json?limit={PAGE_SIZE}&page={page}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MerchantMapper/1.0)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status != 200:
            raise ValueError(f"HTTP {resp.status} from {url}")
        data = json.loads(resp.read().decode("utf-8"))
    products = data.get("products")
    if not isinstance(products, list):
        raise ValueError("Response did not contain a products array — is this a Shopify store?")
    return products


def fetch_shopify_products(store_url: str) -> pd.DataFrame:
    """
    Fetch all products from a Shopify store and return a flat DataFrame,
    one row per variant, using column names that mirror Google Merchant Centre
    conventions so the existing pipeline works unchanged.
    """
    store_url = _normalise_url(store_url)
    currency = _detect_currency(store_url)

    all_products: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        try:
            products = _fetch_page(store_url, page)
        except urllib.error.HTTPError as exc:
            if exc.code == 401:
                raise ValueError(
                    "This Shopify store is password-protected. "
                    "The products catalogue is not publicly accessible."
                ) from exc
            if exc.code == 404:
                raise ValueError(
                    f"Could not find a products catalogue at {store_url}. "
                    "Check the URL and try again."
                ) from exc
            raise ValueError(f"HTTP error {exc.code} fetching {store_url}") from exc
        except urllib.error.URLError as exc:
            raise ValueError(f"Could not reach {store_url}: {exc.reason}") from exc

        if not products:
            break
        all_products.extend(products)
        if len(products) < PAGE_SIZE:
            break

    if not all_products:
        raise ValueError(
            f"No products found at {store_url}. "
            "Make sure this is a Shopify store with a public catalogue."
        )

    rows: list[dict] = []

    for product in all_products:
        product_id = str(product.get("id", ""))
        handle = str(product.get("handle", "") or product_id)
        title = str(product.get("title", ""))
        description = _strip_html(str(product.get("body_html", "") or ""))
        vendor = str(product.get("vendor", ""))
        product_type = str(product.get("product_type", ""))
        tags_raw = product.get("tags", [])
        tags = ", ".join(tags_raw) if isinstance(tags_raw, list) else str(tags_raw)
        published_at = str(product.get("published_at", "") or "")

        images: list[dict] = product.get("images") or []
        image_link = str(images[0].get("src", "")) if images else ""
        additional_image_link = ",".join(
            str(img.get("src", "")) for img in images[1:] if img.get("src")
        )

        # Build option position → column name mapping
        option_map: dict[int, str] = {}
        for opt in product.get("options") or []:
            pos = int(opt.get("position", 1)) - 1  # 0-indexed
            option_map[pos] = _option_col_name(str(opt.get("name", "")))

        variants: list[dict] = product.get("variants") or []
        for variant in variants:
            variant_id = str(variant.get("id", ""))
            sku = str(variant.get("sku") or "").strip() or f"{handle}_{variant_id}"
            variant_title = str(variant.get("title", "") or "")

            full_title = (
                f"{title} - {variant_title}"
                if variant_title and variant_title.lower() != "default title"
                else title
            )

            # Price: price = current selling price, compare_at_price = original/was price
            raw_price = str(variant.get("price") or "")
            raw_compare = str(variant.get("compare_at_price") or "")
            try:
                p = float(raw_price) if raw_price else 0.0
            except (ValueError, TypeError):
                p = 0.0
            try:
                c = float(raw_compare) if raw_compare else 0.0
            except (ValueError, TypeError):
                c = 0.0

            if c and c > p:
                # On sale: compare_at is the original price, price is the sale price
                price_str = _fmt_price(c, currency)
                sale_price_str = _fmt_price(p, currency)
            else:
                price_str = _fmt_price(p, currency)
                sale_price_str = ""

            availability = "in stock" if variant.get("available") else "out of stock"
            grams = variant.get("grams") or variant.get("weight_grams") or 0
            try:
                weight_kg = float(grams) / 1000
            except (ValueError, TypeError):
                weight_kg = 0.0

            row: dict[str, str] = {
                "id": sku,
                "item group id": handle,
                "title": full_title,
                "description": description,
                "price": price_str,
                "sale price": sale_price_str,
                "availability": availability,
                "condition": "new",
                "brand": vendor,
                "product type": product_type,
                "link": f"{store_url}/products/{handle}?variant={variant_id}",
                "image link": image_link,
                "additional image link": additional_image_link,
                "tags": tags,
                "shopify product id": product_id,
                "shopify variant id": variant_id,
                "weight kg": f"{weight_kg:.2f}" if weight_kg > 0 else "",
                "published at": published_at,
            }

            # Option columns (color, size, material, or named option)
            # Skip any option that would overwrite a core field — this handles
            # Shopify's "Title"/"Default Title" placeholder on single-variant products
            for pos, col_name in option_map.items():
                if col_name in _CORE_COLUMNS:
                    continue
                option_key = f"option{pos + 1}"
                row[col_name] = str(variant.get(option_key, "") or "")

            rows.append(row)

    df = pd.DataFrame(rows)
    # Ensure all values are strings and blanks are clean
    df = df.fillna("").astype(str).replace("nan", "").replace("None", "")
    return df


def shopify_keep_map(df: pd.DataFrame) -> dict[str, bool]:
    """Build initial keep_map with Shopify-relevant columns on by default."""
    rec_norm = {_norm(c) for c in RECOMMENDED_SHOPIFY}
    return {c: (_norm(c) in rec_norm) for c in df.columns}
