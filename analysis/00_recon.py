"""Reconocimiento del dataset: columnas reales, cardinalidades y vocabularios.

No calcula nada del modelo. Solo responde "qué hay dentro de cada fichero",
que es lo que condiciona cómo se puede etiquetar y qué features son viables.
"""

from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "dataset"
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 50)


def peek(name: str, nrows: int | None = None) -> pd.DataFrame:
    df = pd.read_csv(DATA / name, nrows=nrows, low_memory=False)
    print(f"\n{'=' * 80}\n{name}  shape={df.shape}\n{'=' * 80}")
    print("columnas:", list(df.columns))
    print(df.head(3).to_string())
    return df


def vocab(df: pd.DataFrame, col: str, top: int = 25) -> None:
    if col not in df.columns:
        print(f"  [!] no existe la columna {col}")
        return
    vc = df[col].value_counts(dropna=False)
    nulls = df[col].isna().mean()
    print(f"\n-- {col}: {df[col].nunique()} valores distintos, {nulls:.1%} nulos")
    print(vc.head(top).to_string())


for f in ["groups.csv", "companies.csv", "banking_products.csv", "debt_products.csv",
          "debt_schedule_config.csv", "balances.csv"]:
    df = peek(f)
    for col in ["erp", "country", "currency", "type", "service", "bank_name",
                "amortization_type", "interest_type", "amortising_frequency"]:
        if col in df.columns:
            vocab(df, col, top=12)
    if f == "debt_products.csv":
        print("\nnulos por columna:\n", df.isna().mean().round(3).to_string())
        print("\ncompanies con algun debt product:", df.company_id.nunique())
    if f == "debt_schedule_config.csv":
        print("\ncompanies con cuadro de amortizacion:", df.company_id.nunique())
    if f == "balances.csv":
        print("\nnulos por columna:\n", df.isna().mean().round(3).to_string())
        print("\nfechas:", df.date.value_counts().head().to_string())

tx = peek("transactions.csv", nrows=400_000)
for col in ["status", "accounting_status", "category", "exchange_rate"]:
    vocab(tx, col, top=40)
print("\nnulos por columna:\n", tx.isna().mean().round(3).to_string())
print("\namount: signo")
print((tx.amount > 0).value_counts(normalize=True).to_string())
print("\ndescription ejemplos:")
print(tx.description.dropna().head(15).to_string())

inv = peek("invoices.csv", nrows=400_000)
for col in ["document_type", "status", "currency", "accounting_currency"]:
    vocab(inv, col, top=25)
print("\nnulos por columna:\n", inv.isna().mean().round(3).to_string())
print("\namount: signo")
print((inv.amount > 0).value_counts(normalize=True).to_string())
print("\nconcept ejemplos:")
print(inv.concept.dropna().head(15).to_string())
print("\ncruce signo x document_type:")
print(pd.crosstab(inv.document_type, inv.amount > 0).to_string())
