"""Exporta analysis/transaction_categories.parquet (08_categories.py) a CSV
para que el motor TypeScript lo lea sin dependencias de parquet.

Salida: analysis/transaction_categories.csv con
transaction_id,normalized_category,category_confidence
"""
from pathlib import Path
import pandas as pd

HERE = Path(__file__).resolve().parent
SRC = HERE / "transaction_categories.parquet"
DST = HERE / "transaction_categories.csv"

def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"No existe {SRC}. Ejecuta antes: python analysis/08_categories.py")
    df = pd.read_parquet(SRC, columns=["transaction_id", "normalized_category", "category_confidence"])
    df["normalized_category"] = df["normalized_category"].fillna("unknown")
    df["category_confidence"] = df["category_confidence"].fillna(0.0)
    df.to_csv(DST, index=False)
    print(f"{len(df)} filas -> {DST}")

if __name__ == "__main__":
    main()
