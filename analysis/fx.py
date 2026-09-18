"""Tabla de tipos de cambio a EUR.

Por que hace falta: el campo `exchange_rate` del dataset NO convierte a euros.
Convierte de `currency` a `accounting_currency` (y para las filas cuya divisa ya
es la de contabilidad vale 1,0, que es la mayoria). Sin una tabla propia los
importes de distintas divisas no son comparables, y eso rompe cualquier
comparacion de tamano entre empresas: hay facturas por 2,19e11 en COP que son
unos 50 M EUR.

Los tipos son anclas aproximadas de medio plazo, una por divisa, no series
diarias. Para este dataset sobra: es sintetico y lo unico que se necesita es
comparabilidad de orden de magnitud entre empresas. Si algun dia hacen falta
tipos por fecha, se sustituye `FX_PER_EUR` por un merge contra una serie real y
el resto del codigo no cambia.

Convencion: unidades de divisa por 1 EUR. Para pasar a euros se divide.
"""

from __future__ import annotations

import pandas as pd

# unidades de divisa por 1 EUR
FX_PER_EUR: dict[str, float] = {
    "EUR": 1.0,
    # Europa
    "GBP": 0.85,
    "CHF": 0.95,
    "DKK": 7.46,      # peg al euro
    "SEK": 11.30,
    "NOK": 11.50,
    "PLN": 4.30,
    "CZK": 25.00,
    "HUF": 390.0,
    "RON": 4.97,
    "TRY": 38.0,      # muy volatil, ancla gruesa
    "RUB": 100.0,
    "ISK": 150.0,
    "BAM": 1.96,      # peg al euro
    # America
    "USD": 1.08,
    "CAD": 1.47,
    "MXN": 19.50,
    "BRL": 5.90,
    "ARS": 1100.0,    # muy volatil, ancla gruesa
    "CLP": 1020.0,
    "COP": 4400.0,
    "PEN": 4.05,
    # Asia y Pacifico
    "JPY": 165.0,
    "CNY": 7.80,
    "HKD": 8.40,
    "SGD": 1.45,
    "MYR": 4.90,
    "THB": 38.0,
    "PHP": 62.0,
    "IDR": 17000.0,
    "INR": 90.0,
    "VND": 27000.0,
    "AUD": 1.65,
    "NZD": 1.78,
    # Oriente Medio y Africa
    "AED": 3.97,
    "SAR": 4.05,
    "ILS": 4.00,
    "ZAR": 20.00,
    "NAD": 20.00,     # peg al rand
    "MAD": 10.80,
    "GHS": 15.00,
    "AOA": 950.0,
    "MZN": 69.00,
    "XOF": 655.957,   # peg al euro
}


def to_eur(amount: pd.Series, currency: pd.Series) -> pd.Series:
    """Convierte importes a EUR. Las divisas desconocidas salen NaN a proposito:
    mejor un hueco visible que un numero inventado con tres ordenes de magnitud
    de error."""
    rate = currency.map(FX_PER_EUR)
    return amount / rate


def product_currency(dataset_dir) -> pd.Series:
    """Divisa por product_id. Hace falta porque transactions.csv no trae divisa:
    la hereda de la cuenta bancaria."""
    from pathlib import Path

    d = Path(dataset_dir)
    parts = [
        pd.read_csv(d / "banking_products.csv", usecols=["product_id", "currency"]),
        pd.read_csv(d / "debt_products.csv", usecols=["product_id", "currency"]),
    ]
    return pd.concat(parts).drop_duplicates("product_id").set_index("product_id").currency


if __name__ == "__main__":
    from pathlib import Path

    DATA = Path(__file__).resolve().parents[1] / "dataset"
    inv = pd.read_csv(DATA / "invoices.csv", usecols=["currency", "amount", "document_type"])
    inv = inv[inv.document_type.isin(["invoice", "invoiceGroup"])]
    inv["eur"] = to_eur(inv.amount.abs(), inv.currency)

    ref = inv.loc[inv.currency == "EUR", "eur"].median()
    print("Validacion: mediana de factura en EUR por divisa de origen.")
    print(f"Si la tabla es razonable, todas deberian caer en el mismo orden que EUR ({ref:,.0f}).\n")
    chk = inv.groupby("currency").agg(n=("eur", "size"), mediana_eur=("eur", "median"),
                                      total_eur=("eur", "sum"))
    chk["ratio_vs_eur"] = (chk.mediana_eur / ref).round(2)
    print(chk[chk.n >= 50].sort_values("n", ascending=False).round(0).to_string())

    falta = sorted(set(inv.currency.dropna()) - set(FX_PER_EUR))
    print(f"\ndivisas sin tipo en la tabla: {falta if falta else 'ninguna'}")
    print(f"importe convertido: {inv.eur.notna().mean():.3%} de las facturas")
