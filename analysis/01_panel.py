"""Construye el panel empresa-mes a partir de transactions/invoices/balances.

Salida: analysis/panel.parquet (una fila por company_id x month) y
analysis/companies_meta.parquet (una fila por empresa).

Notas de implementacion que condicionan todo lo demas:

- balances.csv solo tiene foto a 2026-09-01, asi que el saldo historico se
  reconstruye hacia atras con la identidad contable
  saldo_t = saldo_final - suma(flujos posteriores a t). Es una identidad, no una
  prediccion, pero ojo: usa flujos futuros, asi que en produccion esto se
  sustituye por el saldo real del mes. Para features solo se usa saldo_t y
  pasado, nunca saldo_final directamente.
- Los importes se llevan a EUR multiplicando por exchange_rate. El script
  imprime un diagnostico para verificar que la direccion del cambio es la
  correcta.
"""

from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dataset"
OUT = Path(__file__).resolve().parent

MONTH_START = "2024-09-01"
MONTH_END = "2026-09-01"

TX_CATS = [
    "collection", "bulk_collection", "payment", "bulk_payment", "fee", "utility",
    "transfer", "cash_settlement", "tax", "pos_settlement", "debt_repayment",
    "salary", "cash_withdrawal", "collection_refund", "social_security",
    "interest_charge", "pos_withdrawal", "investment_deployment", "payment_refund",
    "investment_return", "tax_refund",
]

# Texto de banco que delata impagos / devoluciones de recibo domiciliado.
UNPAID_RE = r"impagad|devoluc.{0,12}recib|retroces|rechaz|unpaid|returned\s+direct|reversal"

CASH_TYPES = {"checking", "saving", "wallet"}


def month_floor(s: pd.Series) -> pd.Series:
    return pd.to_datetime(s, errors="coerce").dt.to_period("M").dt.to_timestamp()


def fx_diagnostic() -> None:
    inv = pd.read_csv(DATA / "invoices.csv", usecols=["currency", "amount", "exchange_rate"], nrows=300_000)
    eur = inv.loc[inv.currency == "EUR", "amount"].abs().median()
    for cur in ["USD", "GBP", "CLP", "COP"]:
        sub = inv.loc[inv.currency == cur]
        if sub.empty:
            continue
        raw = sub.amount.abs().median()
        mul = (sub.amount * sub.exchange_rate).abs().median()
        div = (sub.amount / sub.exchange_rate).abs().median()
        print(f"  {cur}: mediana raw={raw:,.0f}  x_rate={mul:,.0f}  /rate={div:,.0f}   (EUR={eur:,.0f})")


def build_transactions() -> pd.DataFrame:
    prod_type = pd.read_csv(DATA / "banking_products.csv", usecols=["product_id", "type"])
    cash_products = set(prod_type.loc[prod_type.type.isin(CASH_TYPES), "product_id"])

    usecols = ["company_id", "product_id", "date", "amount", "exchange_rate", "category", "description"]
    parts = []
    reader = pd.read_csv(DATA / "transactions.csv", usecols=usecols, chunksize=400_000, low_memory=False)
    for i, ch in enumerate(reader):
        ch["month"] = month_floor(ch.date)
        ch["eur"] = ch.amount * ch.exchange_rate.fillna(1.0)
        ch["is_cash"] = ch.product_id.isin(cash_products)
        ch["unpaid_hit"] = ch.description.fillna("").str.contains(UNPAID_RE, case=False, regex=True)

        base = ch.groupby(["company_id", "month"], observed=True).agg(
            tx_n=("eur", "size"),
            inflow=("eur", lambda x: x[x > 0].sum()),
            outflow=("eur", lambda x: -x[x < 0].sum()),
            net=("eur", "sum"),
            net_cash=("eur", "sum"),  # se corrige abajo con is_cash
            unpaid_n=("unpaid_hit", "sum"),
        )
        cash_net = ch[ch.is_cash].groupby(["company_id", "month"], observed=True).eur.sum().rename("net_cash_true")
        cat = (
            ch[ch.category.isin(TX_CATS)]
            .assign(absent=lambda d: d.eur.abs())
            .pivot_table(index=["company_id", "month"], columns="category", values="absent",
                         aggfunc="sum", observed=True)
            .add_prefix("cat_")
        )
        cat_n = (
            ch[ch.category.isin(TX_CATS)]
            .pivot_table(index=["company_id", "month"], columns="category", values="eur",
                         aggfunc="size", observed=True)
            .add_prefix("n_")
        )
        parts.append(base.join(cash_net).join(cat).join(cat_n))
        print(f"    chunk {i + 1} ok", flush=True)

    tx = pd.concat(parts)
    tx = tx.groupby(level=[0, 1]).sum(min_count=1)
    tx["net_cash"] = tx.pop("net_cash_true").fillna(0.0)
    return tx


def build_invoices() -> tuple[pd.DataFrame, pd.DataFrame]:
    inv = pd.read_csv(
        DATA / "invoices.csv",
        usecols=["company_id", "document_type", "issuance_date", "due_date", "payment_date",
                 "amount", "pending_amount", "status", "exchange_rate", "counterparty_id"],
        low_memory=False,
    )
    inv = inv[inv.document_type.isin(["invoice", "invoiceGroup"])].copy()
    inv["eur"] = inv.amount * inv.exchange_rate.fillna(1.0)
    inv["issued"] = inv.eur > 0  # positivo = emitida (cliente nos debe); negativo = recibida
    for c in ["issuance_date", "due_date", "payment_date"]:
        inv[c] = pd.to_datetime(inv[c], errors="coerce")
    inv["m_iss"] = inv.issuance_date.dt.to_period("M").dt.to_timestamp()
    inv["m_pay"] = inv.payment_date.dt.to_period("M").dt.to_timestamp()
    inv["days_late"] = (inv.payment_date - inv.due_date).dt.days
    inv["days_to_cash"] = (inv.payment_date - inv.issuance_date).dt.days
    inv["terms"] = (inv.due_date - inv.issuance_date).dt.days

    out = []
    for issued, tag in [(True, "ar"), (False, "ap")]:
        sub = inv[inv.issued == issued]
        by_iss = sub.groupby(["company_id", "m_iss"], observed=True).agg(
            **{f"{tag}_n": ("eur", "size"),
               f"{tag}_amount": ("eur", lambda x: x.abs().sum()),
               f"{tag}_terms": ("terms", "median"),
               f"{tag}_pending": ("pending_amount", lambda x: x.abs().sum())}
        )
        by_iss.index = by_iss.index.set_names(["company_id", "month"])
        by_pay = sub.groupby(["company_id", "m_pay"], observed=True).agg(
            **{f"{tag}_paid_n": ("eur", "size"),
               f"{tag}_paid_amount": ("eur", lambda x: x.abs().sum()),
               f"{tag}_days_late": ("days_late", "median"),
               f"{tag}_days_late_w": ("days_late", "mean"),
               f"{tag}_share_late": ("days_late", lambda x: (x > 0).mean()),
               f"{tag}_share_late30": ("days_late", lambda x: (x > 30).mean()),
               f"{tag}_dso": ("days_to_cash", "median")}
        )
        by_pay.index = by_pay.index.set_names(["company_id", "month"])
        out.append(by_iss.join(by_pay, how="outer"))

    panel = out[0].join(out[1], how="outer")

    # Concentracion de clientes (HHI) por empresa-mes sobre 12m moviles se hace
    # luego; aqui solo el HHI del mes con facturas emitidas.
    hhi = (
        inv[inv.issued]
        .assign(a=lambda d: d.eur.abs())
        .groupby(["company_id", "m_iss", "counterparty_id"], observed=True).a.sum()
        .groupby(level=[0, 1], observed=True)
        .apply(lambda s: float(((s / s.sum()) ** 2).sum()) if s.sum() > 0 else np.nan)
        .rename("ar_hhi")
    )
    hhi.index = hhi.index.set_names(["company_id", "month"])
    panel = panel.join(hhi, how="outer")
    return panel, inv


def main() -> None:
    print("diagnostico FX (que direccion normaliza a EUR):")
    fx_diagnostic()

    print("\ntransactions -> panel mensual")
    tx = build_transactions()
    print("  ", tx.shape)

    print("invoices -> panel mensual")
    inv_panel, _ = build_invoices()
    print("  ", inv_panel.shape)

    companies = pd.read_csv(DATA / "companies.csv")
    months = pd.date_range(MONTH_START, MONTH_END, freq="MS")
    grid = pd.MultiIndex.from_product([companies.company_id, months], names=["company_id", "month"])

    panel = pd.DataFrame(index=grid).join(tx).join(inv_panel)

    # Reconstruccion del saldo de caja hacia atras desde la foto final.
    bal = pd.read_csv(DATA / "balances.csv", usecols=["product_id", "company_id", "balance"])
    prod_type = pd.read_csv(DATA / "banking_products.csv", usecols=["product_id", "type"])
    bal = bal.merge(prod_type, on="product_id", how="left")
    cash_final = bal[bal.type.isin(CASH_TYPES)].groupby("company_id").balance.sum()

    net = panel.net_cash.fillna(0.0).unstack("month").sort_index(axis=1)
    # flujos estrictamente posteriores al mes t
    fwd = net.iloc[:, ::-1].cumsum(axis=1).iloc[:, ::-1].shift(-1, axis=1).fillna(0.0)
    cash = fwd.mul(0).add(cash_final.reindex(net.index), axis=0) - fwd
    panel["cash_eom"] = cash.stack()

    panel = panel.reset_index()
    panel.to_parquet(OUT / "panel.parquet", index=False)

    meta = companies.merge(
        pd.read_csv(DATA / "groups.csv", usecols=["group_id", "n_companies_in_sample"]),
        on="group_id", how="left",
    )
    debt = pd.read_csv(DATA / "debt_products.csv")
    sched = pd.read_csv(DATA / "debt_schedule_config.csv", usecols=["company_id"])
    meta["has_debt"] = meta.company_id.isin(debt.company_id)
    meta["has_schedule"] = meta.company_id.isin(sched.company_id)
    meta["n_debt_products"] = meta.company_id.map(debt.company_id.value_counts()).fillna(0)
    loc = debt[debt.type == "lineofcredit"].groupby("company_id").agg(
        loc_granted=("granted", lambda x: x.abs().sum()),
        loc_outstanding=("outstanding", lambda x: x.abs().sum()),
    )
    meta = meta.merge(loc, on="company_id", how="left")
    meta["cash_final"] = meta.company_id.map(cash_final)
    meta.to_parquet(OUT / "companies_meta.parquet", index=False)

    print("\npanel:", panel.shape, "->", OUT / "panel.parquet")
    print("meta :", meta.shape, "->", OUT / "companies_meta.parquet")


if __name__ == "__main__":
    main()
