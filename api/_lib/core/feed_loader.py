"""Feed file loading utilities (TSV, CSV, Excel, ZIP)."""
import hashlib
import io
import zipfile
from pathlib import Path
from typing import Tuple

import pandas as pd


def hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def excel_sheet_names(data: bytes) -> Tuple[str, ...]:
    xls = pd.ExcelFile(io.BytesIO(data), engine="openpyxl")
    return tuple(xls.sheet_names)


def load_excel_bytes(file_bytes: bytes, sheet_name: str) -> pd.DataFrame:
    xls = pd.ExcelFile(io.BytesIO(file_bytes), engine="openpyxl")
    return pd.read_excel(
        xls,
        sheet_name=sheet_name,
        dtype=str,
        na_filter=False,
        engine="openpyxl",
    )


def load_csv_like(file_bytes: bytes, sep: str) -> pd.DataFrame:
    return pd.read_csv(
        io.BytesIO(file_bytes),
        sep=sep,
        dtype=str,
        na_filter=False,
        low_memory=False,
        on_bad_lines="skip",
    )


def load_feed(file_bytes: bytes, filename: str, sheet_name: str = None) -> pd.DataFrame:
    """Load a feed file from bytes. Returns a DataFrame with normalised column headers."""
    ext = Path(filename).suffix.lower()
    if ext in {".xlsx", ".xls"}:
        sheet = sheet_name or excel_sheet_names(file_bytes)[0]
        df = load_excel_bytes(file_bytes, sheet)
    elif ext in {".tsv", ".txt"}:
        df = load_csv_like(file_bytes, "\t")
    elif ext == ".csv":
        df = load_csv_like(file_bytes, ",")
    elif ext == ".zip":
        _SUPPORTED = {".tsv", ".txt", ".csv", ".xlsx", ".xls"}
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            inner_names = [n for n in zf.namelist() if Path(n).suffix.lower() in _SUPPORTED]
            if not inner_names:
                raise ValueError("ZIP contains no supported feed file (.tsv, .txt, .csv, .xlsx, .xls).")
            inner_bytes = zf.read(inner_names[0])
        return load_feed(inner_bytes, inner_names[0], sheet_name)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    # Normalise headers
    df.columns = (
        pd.Index(df.columns)
        .map(lambda x: str(x).strip())
        .str.replace(r"\s+", " ", regex=True)
    )
    return df
