"""Inventario de divisas: que hay, cuanto pesa y donde aparece.

Sirve para dimensionar la tabla de tipos: no interesa cubrir 40 divisas si
treinta de ellas son cuatro facturas.
"""

from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parents[1] / "dataset"

comp = pd.read_csv(DATA / "companies.csv", usecols=["company_id", "currency"])
print("empresas por divisa de contabilidad:")
print(comp.currency.value_counts().to_string())

bank = pd.read_csv(DATA / "banking_products.csv", usecols=["currency"])
print(f"\nproductos bancarios por divisa ({bank.currency.nunique()} divisas):")
print(bank.currency.value_counts().to_string())

inv = pd.read_csv(DATA / "invoices.csv", usecols=["currency", "accounting_currency", "amount"])
print(f"\nfacturas por divisa ({inv.currency.nunique()} divisas): peso en nº y en importe absoluto")
agg = inv.assign(a=inv.amount.abs()).groupby("currency").agg(n=("a", "size"), importe=("a", "sum"))
agg["share_n"] = (agg.n / agg.n.sum()).round(4)
print(agg.sort_values("n", ascending=False).to_string())

print("\ncuantas facturas tienen currency != accounting_currency:")
print(f"  {(inv.currency != inv.accounting_currency).mean():.2%}")

cover = agg.sort_values("n", ascending=False)
cover["acum"] = cover.share_n.cumsum()
print("\ncobertura acumulada por nº de divisas:")
for k in (1, 3, 5, 10, 15, 20):
    if k <= len(cover):
        print(f"  top {k:2d} divisas -> {cover.acum.iloc[k - 1]:.3%} de las facturas")

todas = sorted(set(comp.currency) | set(bank.currency) | set(inv.currency)
               | set(inv.accounting_currency.dropna()))
print(f"\nunion de divisas ({len(todas)}):")
print(" ".join(todas))
