"""Valida dos hipotesis que docs/SCORE_MODEL.md deja abiertas.

1. Direccion de la factura: el documento supone que importe positivo = factura
   a cliente (cobro) y negativo = proveedor (pago), y pide contrastarlo. Se
   contrasta correlacionando el importe facturado mensual con los cobros y
   pagos bancarios del mismo mes: si la hipotesis es correcta, las facturas
   positivas deben correlacionar con la categoria `collection` y las negativas
   con `payment`.

2. Fiabilidad de payment_date: el documento avisa de que payment_date coincide
   casi siempre con due_date. Si es asi, cualquier metrica de dias de retraso
   esta degenerada y no mide comportamiento de pago.
"""

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import report

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "dataset"

inv = pd.read_csv(
    DATA / "invoices.csv",
    usecols=["company_id", "document_type", "issuance_date", "due_date", "payment_date",
             "amount", "pending_amount", "status", "currency"],
    low_memory=False,
)
inv = inv[inv.document_type.isin(["invoice", "invoiceGroup"])].copy()
for c in ["issuance_date", "due_date", "payment_date"]:
    inv[c] = pd.to_datetime(inv[c], errors="coerce")

print("=" * 78)
print("1. DIRECCION DE LA FACTURA (positivo = cliente?)")
print("=" * 78)

panel = pd.read_parquet(HERE / "panel.parquet")
panel["month"] = pd.to_datetime(panel.month)
sub = panel[panel.tx_n.fillna(0) > 0].copy()

pairs = [
    ("ar_amount", "cat_collection", "facturas positivas vs cobros bancarios"),
    ("ar_amount", "cat_payment", "facturas positivas vs pagos bancarios"),
    ("ap_amount", "cat_payment", "facturas negativas vs pagos bancarios"),
    ("ap_amount", "cat_collection", "facturas negativas vs cobros bancarios"),
]
print("correlacion de Spearman sobre empresa-mes (robusta a escala):\n")
for a, b, label in pairs:
    d = sub[[a, b]].dropna()
    d = d[(d[a] > 0) & (d[b] > 0)]
    r = d.corr(method="spearman").iloc[0, 1]
    print(f"  {label:48s} rho={r:+.3f}  (n={len(d)})")

print("\nmismo contraste a nivel empresa (totales de 24 meses):")
tot = sub.groupby("company_id")[["ar_amount", "ap_amount", "cat_collection", "cat_payment"]].sum()
tot = tot[(tot > 0).all(axis=1)]
for a, b, label in pairs:
    print(f"  {label:48s} rho={tot[[a, b]].corr(method='spearman').iloc[0, 1]:+.3f}  (n={len(tot)})")

print("\n[!] Las cuatro correlaciones son casi iguales: el contraste esta contaminado")
print("    por tamano (las empresas grandes tienen mas de todo) y no decide nada.")
print("    Test decisivo: cruzar por counterparty_id el signo de la factura con el")
print("    signo de las transacciones bancarias con esa misma contraparte.\n")

inv_cp = pd.read_csv(DATA / "invoices.csv",
                     usecols=["company_id", "document_type", "amount", "counterparty_id"],
                     low_memory=False)
inv_cp = inv_cp[inv_cp.document_type.isin(["invoice", "invoiceGroup"])].dropna(subset=["counterparty_id"])
inv_side = (
    inv_cp.assign(pos=inv_cp.amount > 0)
    .groupby(["company_id", "counterparty_id"])
    .agg(inv_pos_share=("pos", "mean"), inv_n=("pos", "size"))
)

tx_parts = []
reader = pd.read_csv(DATA / "transactions.csv",
                     usecols=["company_id", "amount", "counterparty_id", "category"],
                     chunksize=500_000, low_memory=False)
for ch in reader:
    ch = ch.dropna(subset=["counterparty_id"])
    tx_parts.append(ch.assign(pos=ch.amount > 0)
                    .groupby(["company_id", "counterparty_id"])
                    .agg(tx_pos=("pos", "sum"), tx_n=("pos", "size")))
tx_side = pd.concat(tx_parts).groupby(level=[0, 1]).sum()
tx_side["tx_pos_share"] = tx_side.tx_pos / tx_side.tx_n

j = inv_side.join(tx_side, how="inner")
j = j[(j.inv_n >= 2) & (j.tx_n >= 2)]
print(f"pares (empresa, contraparte) con facturas y movimientos bancarios: {len(j):,}")

j["factura"] = pd.cut(j.inv_pos_share, [-0.01, 0.2, 0.8, 1.01],
                      labels=["negativa", "mixta", "positiva"])
j["banco"] = pd.cut(j.tx_pos_share, [-0.01, 0.2, 0.8, 1.01],
                    labels=["salida (pagamos)", "mixto", "entrada (cobramos)"])
ct = pd.crosstab(j.factura, j.banco, normalize="index")
print("\nsi el signo identifica la direccion, la diagonal deberia dominar:")
print("(filas: signo de la factura | columnas: signo del dinero en el banco)\n")
print(ct.round(3).to_string())
print("\nrecuento absoluto:")
print(pd.crosstab(j.factura, j.banco).to_string())

print("\n" + "=" * 78)
print("2. FIABILIDAD DE payment_date")
print("=" * 78)

inv["igual"] = inv.payment_date == inv.due_date
inv["days_late"] = (inv.payment_date - inv.due_date).dt.days
print("share de facturas con payment_date == due_date, por estado:")
print(inv.groupby("status").agg(n=("igual", "size"), share_igual=("igual", "mean")).round(3).to_string())

print(f"\nglobal: {inv.igual.mean():.1%} de las facturas tienen payment_date == due_date")
print(f"payment_date nulo: {inv.payment_date.isna().mean():.1%}")

real = inv[~inv.igual & inv.payment_date.notna()]
print(f"\nfacturas con fecha de pago distinta del vencimiento: {len(real):,} ({len(real) / len(inv):.1%})")
print("distribucion de dias de retraso en ESAS facturas:")
print(real.days_late.quantile([0.05, 0.25, 0.5, 0.75, 0.95]).round(1).to_string())
print(f"  de ellas, pagadas tarde (>0 dias): {(real.days_late > 0).mean():.1%}")
print(f"  pagadas >30 dias tarde          : {(real.days_late > 30).mean():.1%}")

print("\ncuantas empresas tienen al menos 20 facturas con fecha de pago informativa:")
per = real.groupby("company_id").size()
print(f"  {(per >= 20).sum()} de {inv.company_id.nunique()} empresas con facturas"
      f"  ({(per >= 20).sum() / inv.company_id.nunique():.1%})")

print("\npending_amount > 0 (cartera viva en la foto final):")
print(f"  facturas: {(inv.pending_amount.abs() > 0).mean():.2%}"
      f"   empresas: {inv[inv.pending_amount.abs() > 0].company_id.nunique()}")

ct_abs = pd.crosstab(j.factura, j.banco)
report.emit("validaciones", {
    "direccion_factura": {
        "pares": int(len(j)),
        "negativa_es_proveedor": float(ct.loc["negativa", "salida (pagamos)"]),
        "positiva_es_cliente": float(ct.loc["positiva", "entrada (cobramos)"]),
        "n_negativa": int(ct_abs.loc["negativa"].sum()),
        "n_positiva": int(ct_abs.loc["positiva"].sum()),
    },
    "payment_date": {
        "share_igual_due_date": float(inv.igual.mean()),
        "share_igual_en_overdue": float(inv.loc[inv.status == "overdue", "igual"].mean()),
        "share_overdue_en_fichero": float((inv.status == "overdue").mean()),
        "facturas_utiles": int(len(real)),
        "share_utiles": float(len(real) / len(inv)),
        "retraso_mediano_utiles": float(real.days_late.median()),
        "retraso_p95_utiles": float(real.days_late.quantile(0.95)),
        "empresas_con_20_utiles": int((per >= 20).sum()),
        "empresas_con_facturas": int(inv.company_id.nunique()),
    },
    "cartera_viva": {
        "share_facturas_pendientes": float((inv.pending_amount.abs() > 0).mean()),
        "empresas": int(inv[inv.pending_amount.abs() > 0].company_id.nunique()),
    },
})
