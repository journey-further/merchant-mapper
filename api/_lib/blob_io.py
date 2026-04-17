"""Vercel Blob helpers for DataFrame persistence."""
from __future__ import annotations

import io
import os
import uuid

import pandas as pd
import requests

_BLOB_API = "https://blob.vercel-storage.com"


def _token() -> str:
    tok = os.environ.get("BLOB_READ_WRITE_TOKEN", "")
    if not tok:
        raise RuntimeError("BLOB_READ_WRITE_TOKEN is not set")
    return tok


def save_df(df: pd.DataFrame, label: str = "blob") -> str:
    """Serialize df to CSV and store in Vercel Blob. Returns the public URL."""
    data = df.to_csv(index=False).encode("utf-8")
    pathname = f"mm/{label}/{uuid.uuid4()}.csv"
    resp = requests.put(
        f"{_BLOB_API}/{pathname}",
        data=data,
        headers={
            "Authorization": f"Bearer {_token()}",
            "Content-Type": "text/csv",
        },
        params={"addRandomSuffix": "false"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["url"]


def load_df(url: str) -> pd.DataFrame:
    """Download a CSV blob from Vercel Blob and return as DataFrame."""
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return pd.read_csv(io.StringIO(resp.text))


def upload_bytes(data: bytes, filename: str, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to Vercel Blob. Returns the public URL."""
    pathname = f"mm/uploads/{uuid.uuid4()}/{filename}"
    resp = requests.put(
        f"{_BLOB_API}/{pathname}",
        data=data,
        headers={
            "Authorization": f"Bearer {_token()}",
            "Content-Type": content_type,
        },
        params={"addRandomSuffix": "false"},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["url"]
