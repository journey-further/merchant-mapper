"""Circular bubble packing chart using circlify."""
import html as html_mod
from typing import Optional

import circlify
import pandas as pd

PALETTE = ["#4C6A92", "#6F8F72", "#B97A57", "#8C6C99", "#C4A46B", "#5B7C99", "#9E6E6E"]
FLAT_COLOR = PALETTE[1]  # teal-ish
SVG_SIZE = 800
SCALE = 380
CENTER = 400


def _col(df: pd.DataFrame, *candidates: str) -> Optional[str]:
    """Find first matching column (case-insensitive, space-insensitive)."""
    normalised = {c.lower().replace(" ", ""): c for c in df.columns}
    for cand in candidates:
        found = normalised.get(cand.lower().replace(" ", ""))
        if found:
            return found
    return None


def build_bubble_svg(
    raw_df: pd.DataFrame,
    n: int,
    cat_col: Optional[str] = None,
) -> tuple[str, int]:
    """
    Returns (svg_html, total_product_count).

    n       — top-N products by clicks to render
    cat_col — column name for category colour grouping (None = single colour)
    """
    total = len(raw_df)

    clicks_col = _col(raw_df, "all clicks", "all_clicks", "28 day clicks", "clicks")
    title_col = _col(raw_df, "title")

    if clicks_col:
        nums = pd.to_numeric(
            raw_df[clicks_col].astype(str).str.extract(r"([\d.]+)")[0],
            errors="coerce",
        ).fillna(0)
    else:
        nums = pd.Series(0.0, index=raw_df.index)

    df = raw_df.copy()
    df["_clicks"] = nums
    df = df.sort_values("_clicks", ascending=False).head(n).reset_index(drop=True)

    titles = df[title_col].astype(str).tolist() if title_col else [str(i) for i in range(len(df))]
    clicks_vals = df["_clicks"].tolist()
    # circlify requires positive values; floor at 1e-9 so equal-sized bubbles render
    # when there's no clicks data rather than raising a division error
    values = [max(v, 1e-9) for v in clicks_vals]

    # Assign colours — cycle through PALETTE per category when cat_col is set
    if cat_col and cat_col in df.columns:
        cats = df[cat_col].astype(str).tolist()
        cat_order = list(dict.fromkeys(cats))  # unique, insertion-ordered
        cat_color = {c: PALETTE[i % len(PALETTE)] for i, c in enumerate(cat_order)}
        row_colors = [cat_color[c] for c in cats]
    else:
        row_colors = [FLAT_COLOR] * len(df)

    circles = circlify.circlify(values, show_enclosure=False)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {SVG_SIZE} {SVG_SIZE}" '
        f'class="bubble-svg" '
        f'style="width:100%;max-width:{SVG_SIZE}px;display:block;margin:auto">'
    ]
    for i, circle in enumerate(circles):
        cx = circle.x * SCALE + CENTER
        cy = -circle.y * SCALE + CENTER  # invert Y axis for SVG coordinate system
        r = max(circle.r * SCALE, 1)
        title = html_mod.escape(titles[i]) if i < len(titles) else ""
        clicks = int(clicks_vals[i]) if i < len(clicks_vals) else 0
        fill = row_colors[i] if i < len(row_colors) else FLAT_COLOR
        parts.append(
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" '
            f'fill="{fill}" opacity="0.8" '
            f'data-title="{title}" data-clicks="{clicks}" '
            f'class="bubble-circle"/>'
        )
    parts.append("</svg>")
    return "".join(parts), total
