"""Diagnostico de balanceo del dataset antes de entrenar nada.

Responde cuatro preguntas, en este orden:

1. Cobertura: cuantos meses de historia real tiene cada empresa y que bloques de
   informacion existen (deuda, cuadro de amortizacion, facturas). El desbalance
   grave de este dataset esta aqui, no en las clases.
2. Escala: como de dispersas son las empresas en tamano y divisa.
3. Etiqueta: prevalencia de cada senal de estres y de la etiqueta compuesta.
4. Trayectoria: existe senal temporal que aprender, o el ruido mensual es
   blanco. Si es blanco, un modelo de trayectoria no puede funcionar.
"""

import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt

sys.path.insert(0, str(Path(__file__).resolve().parent))
import report

HERE = Path(__file__).resolve().parent
FIG = HERE / "figures"
FIG.mkdir(exist_ok=True)
pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 60)

panel = pd.read_parquet(HERE / "panel.parquet")
meta = pd.read_parquet(HERE / "companies_meta.parquet")
panel = panel.sort_values(["company_id", "month"]).reset_index(drop=True)
g = panel.groupby("company_id", sort=False)

H1 = "\n" + "=" * 78 + "\n"


def section(title: str) -> None:
    print(f"{H1}{title}{H1}")


def dist(s: pd.Series, name: str) -> None:
    q = s.quantile([0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]).round(2)
    print(f"{name:34s} n={s.notna().sum():5d}  " + "  ".join(f"p{int(k * 100)}={v:,.2f}" for k, v in q.items()))


# ---------------------------------------------------------------- 1. cobertura
section("1. COBERTURA: cuanta historia real hay por empresa")

panel["has_tx"] = panel.tx_n.fillna(0) > 0
panel["has_inv"] = panel[["ar_n", "ap_n"]].fillna(0).sum(axis=1) > 0

cov = pd.DataFrame({
    "months_tx": g.has_tx.sum(),
    "months_inv": g.has_inv.sum(),
    "tx_total": g.tx_n.sum(),
})
cov["first_active"] = panel[panel.has_tx].groupby("company_id").month.min()
cov["last_active"] = panel[panel.has_tx].groupby("company_id").month.max()
cov["span"] = (
    (cov.last_active.dt.year - cov.first_active.dt.year) * 12
    + (cov.last_active.dt.month - cov.first_active.dt.month) + 1
)
cov["density"] = cov.months_tx / cov.span

print(f"empresas totales: {len(meta)}   celdas empresa-mes: {len(panel)}")
print(f"celdas con transacciones: {panel.has_tx.mean():.1%}   con facturas: {panel.has_inv.mean():.1%}")
dist(cov.months_tx, "meses con movimientos (de 25)")
dist(cov.tx_total, "transacciones por empresa")
print("\nempresas por tramo de meses con movimientos:")
bins = pd.cut(cov.months_tx, [-1, 0, 3, 6, 12, 18, 24, 25],
              labels=["0", "1-3", "4-6", "7-12", "13-18", "19-24", "25"])
print(bins.value_counts().sort_index().to_string())
print(f"\nempresas con >=18 meses: {(cov.months_tx >= 18).mean():.1%}")
print(f"empresas con <=6 meses : {(cov.months_tx <= 6).mean():.1%}")
print(f"empresas con 0 facturas: {(cov.months_inv == 0).mean():.1%}")

print("\nbloques de informacion disponibles (de 1286 empresas):")
for col, label in [("has_debt", "algun producto de deuda"), ("has_schedule", "cuadro de amortizacion")]:
    print(f"  {label:32s} {meta[col].sum():5d}  ({meta[col].mean():.1%})")
print(f"  {'linea de credito con granted':32s} {meta.loc_granted.notna().sum():5d}"
      f"  ({meta.loc_granted.notna().mean():.1%})")
print(f"  {'currency = EUR':32s} {(meta.currency == 'EUR').sum():5d}"
      f"  ({(meta.currency == 'EUR').mean():.1%})")
print(f"  {'country informado':32s} {meta.country.notna().sum():5d}  ({meta.country.notna().mean():.1%})")
print(f"  {'erp informado':32s} {meta.erp.notna().sum():5d}  ({meta.erp.notna().mean():.1%})")

print("\ntamano de grupo (empresas por grupo en la muestra):")
print(meta.n_companies_in_sample.value_counts().sort_index().head(12).to_string())
print(f"empresas que comparten grupo con otra: {(meta.n_companies_in_sample > 1).mean():.1%}")

# ------------------------------------------------------------------- 2. escala
section("2. ESCALA: dispersion de tamano (ya normalizado a EUR via analysis/fx.py)")

size = panel.groupby("company_id").agg(outflow_m=("outflow", "median"), inflow_m=("inflow", "median"))
size = size[size.outflow_m > 0]
dist(size.outflow_m, "outflow mensual mediano (EUR)")
print(f"ratio p90/p10 de tamano: {size.outflow_m.quantile(0.9) / max(size.outflow_m.quantile(0.1), 1):,.0f}x")
print("\nmayores por outflow mediano (para ver si quedan outliers absurdos):")
top = size.outflow_m.nlargest(6)
print(pd.concat([top.rename("outflow_med"),
                 meta.set_index("company_id").currency.reindex(top.index)], axis=1).round(0).to_string())

# ------------------------------------------------- 3. features y senales
section("3. SENALES DE ESTRES: prevalencia")

p = panel.copy()
p["outflow"] = p.outflow.fillna(0)
p["inflow"] = p.inflow.fillna(0)
gg = p.groupby("company_id", sort=False)
p["outflow_r3"] = gg.outflow.transform(lambda s: s.rolling(3, min_periods=1).mean())
p["cash_days"] = np.where(p.outflow_r3 > 0, p.cash_eom / (p.outflow_r3 / 30.0), np.nan)
p["net_margin"] = np.where(p.inflow > 0, p.net / p.inflow, np.nan)
p["fee_ratio"] = np.where(p.outflow > 0, p[["cat_fee", "cat_interest_charge"]].fillna(0).sum(axis=1) / p.outflow, np.nan)
p["unpaid_rate"] = np.where(p.tx_n.fillna(0) > 0, p.unpaid_n.fillna(0) / p.tx_n, np.nan)
p["salary_paid"] = p.cat_salary.fillna(0) > 0

# Las senales de retraso exigen un minimo de facturas con fecha de pago
# informativa: con una sola factura, el ratio es 0 o 1 y no dice nada.
MIN_FRAS = 3
flags = {}
flags["caja < 10 dias"] = p.cash_days < 10
flags["caja < 0"] = p.cash_eom < 0
flags["flujo neto negativo"] = p.net < 0
flags["pagamos >30d tarde (>50% fras)"] = (p.ap_share_late30 > 0.5) & (p.ap_util_n >= MIN_FRAS)
flags["nos pagan >30d tarde (>50%)"] = (p.ar_share_late30 > 0.5) & (p.ar_util_n >= MIN_FRAS)
flags["algun impago/devolucion"] = p.unpaid_n.fillna(0) >= 1
flags["comisiones+intereses >2% salida"] = p.fee_ratio > 0.02
for k, v in flags.items():
    p[f"f_{k}"] = v.fillna(False)

print("prevalencia por empresa-mes (sobre celdas con actividad) y empresas afectadas:")
active = p.has_tx
for k in flags:
    col = p[f"f_{k}"]
    ever = col.groupby(p.company_id).any().mean()
    print(f"  {k:34s} mes={col[active].mean():6.2%}   empresas alguna vez={ever:6.1%}")

print("\ndistribuciones de los ratios (celdas activas):")
for c in ["cash_days", "net_margin", "fee_ratio", "ap_days_late", "ar_days_late", "ar_dso", "ar_hhi"]:
    dist(p.loc[active, c], c)

print("\ncobertura de las metricas de comportamiento de pago:")
for tag, label in [("ar", "clientes"), ("ap", "proveedores")]:
    tot = p[f"{tag}_paid_n"].sum()
    util = p[f"{tag}_util_n"].sum()
    cells = (p[f"{tag}_util_n"] >= MIN_FRAS).sum()
    comps = (p.groupby("company_id")[f"{tag}_util_n"].sum() >= 20).sum()
    print(f"  {label:12s} facturas con fecha de pago util: {util:,.0f} de {tot:,.0f}"
          f" ({util / tot:.1%})   celdas con >={MIN_FRAS}: {cells:,}"
          f"   empresas con >=20: {comps}")

# etiqueta compuesta: estres severo en el mes
severe = (
    p["f_caja < 10 dias"].astype(int)
    + p["f_algun impago/devolucion"].astype(int)
    + p["f_pagamos >30d tarde (>50% fras)"].astype(int)
    + p["f_comisiones+intereses >2% salida"].astype(int)
)
p["stress_now"] = severe >= 2
print(f"\nestres compuesto (>=2 senales a la vez): mes={p.loc[active, 'stress_now'].mean():.2%}"
      f"   empresas alguna vez={p.groupby('company_id').stress_now.any().mean():.1%}")

# etiqueta forward 12m
p["stress_fwd12"] = (
    p.groupby("company_id", sort=False).stress_now
    .transform(lambda s: s.shift(-1).rolling(12, min_periods=1).max())
    .fillna(0).astype(bool)
)
mask = active & p.month.between("2024-09-01", "2025-09-01")
print(f"etiqueta 'estres en los proximos 12m' en ventana entrenable: pos={p.loc[mask, 'stress_fwd12'].mean():.2%}"
      f"  (n={mask.sum()})")
print(f"desbalance resultante 1:{(1 - p.loc[mask, 'stress_fwd12'].mean()) / max(p.loc[mask, 'stress_fwd12'].mean(), 1e-9):,.0f}")

# ------------------------------------------------------- 4. senal de trayectoria
section("4. TRAYECTORIA: hay senal temporal o es ruido blanco")

feats = ["cash_days", "net_margin", "fee_ratio", "ap_days_late", "ar_days_late", "ar_dso", "ar_hhi", "outflow"]
rows = []
for c in feats:
    sub = p.loc[active, ["company_id", "month", c]].dropna()
    if sub[c].nunique() < 10:
        continue
    # winsorizado para que las colas no dominen
    lo, hi = sub[c].quantile([0.01, 0.99])
    sub[c] = sub[c].clip(lo, hi)
    grp = sub.groupby("company_id")[c]
    mu = grp.transform("mean")
    dev = sub[c] - mu
    var_within = dev.var()
    var_between = mu.var()
    icc = var_between / (var_between + var_within)
    # autocorrelacion de la desviacion intra-empresa
    d = sub.assign(dev=dev).set_index(["company_id", "month"]).dev.unstack("month").sort_index(axis=1)
    acf = []
    for lag in (1, 2, 3, 6):
        a, b = d.iloc[:, :-lag], d.shift(-lag, axis=1).iloc[:, :-lag]
        both = pd.concat([a.stack(), b.stack()], axis=1).dropna()
        acf.append(both.corr().iloc[0, 1] if len(both) > 200 else np.nan)
    # persistencia de la pendiente: primera mitad vs segunda mitad
    half = d.shape[1] // 2

    def slope(block: pd.DataFrame) -> pd.Series:
        x = np.arange(block.shape[1], dtype=float)
        out = {}
        for idx, row in block.iterrows():
            ok = row.notna().values
            out[idx] = np.polyfit(x[ok], row.values[ok], 1)[0] if ok.sum() >= 5 else np.nan
        return pd.Series(out)

    s1, s2 = slope(d.iloc[:, :half]), slope(d.iloc[:, half:])
    pers = pd.concat([s1, s2], axis=1).dropna().corr().iloc[0, 1] if len(s1.dropna()) > 50 else np.nan
    rows.append({"feature": c, "ICC": icc, "acf1": acf[0], "acf2": acf[1], "acf3": acf[2],
                 "acf6": acf[3], "slope_persist": pers})

traj = pd.DataFrame(rows).set_index("feature").round(3)
print("ICC = parte de la varianza que es 'como es la empresa' (nivel).")
print("acfk = autocorrelacion de la desviacion mensual a k meses (persistencia = regimenes).")
print("slope_persist = corr(pendiente 1a mitad, pendiente 2a mitad) por empresa.\n")
print(traj.to_string())

# ---------------------------------------------------------------------- figuras
fig, ax = plt.subplots(1, 3, figsize=(16, 4.2))
cov.months_tx.plot.hist(bins=26, ax=ax[0], color="#2b6cb0")
ax[0].set_title("Meses con movimientos por empresa")
ax[0].set_xlabel("meses (de 25)")
np.log10(size.outflow_m.clip(lower=1)).plot.hist(bins=40, ax=ax[1], color="#2f855a")
ax[1].set_title("Tamano: log10(outflow mensual mediano EUR)")
prev = pd.Series({k: p.loc[active, f"f_{k}"].mean() for k in flags}).sort_values()
prev.plot.barh(ax=ax[2], color="#c05621")
ax[2].set_title("Prevalencia de senales (empresa-mes)")
ax[2].set_xlabel("share")
plt.tight_layout()
plt.savefig(FIG / "balance_overview.png", dpi=130)
print(f"\nfigura -> {FIG / 'balance_overview.png'}")

fig, ax = plt.subplots(1, 2, figsize=(12, 4.2))
traj[["acf1", "acf2", "acf3", "acf6"]].T.plot(ax=ax[0], marker="o")
ax[0].axhline(0, color="k", lw=0.8)
ax[0].set_title("Autocorrelacion intra-empresa (persistencia)")
ax[0].legend(fontsize=7)
traj.ICC.sort_values().plot.barh(ax=ax[1], color="#553c9a")
ax[1].set_title("ICC: varianza entre empresas / total")
plt.tight_layout()
plt.savefig(FIG / "trajectory_signal.png", dpi=130)
print(f"figura -> {FIG / 'trajectory_signal.png'}")

p.to_parquet(HERE / "panel_features.parquet", index=False)
print(f"panel con features -> {HERE / 'panel_features.parquet'}")

report.emit("cobertura", {
    "empresas": int(len(meta)),
    "celdas_empresa_mes": int(len(panel)),
    "grupos": int(meta.group_id.nunique()),
    "share_comparte_grupo": float((meta.n_companies_in_sample > 1).mean()),
    "meses_mediana": float(cov.months_tx.median()),
    "empresas_7_12_meses": int(((cov.months_tx >= 7) & (cov.months_tx <= 12)).sum()),
    "share_18_o_mas": float((cov.months_tx >= 18).mean()),
    "bloques": [
        {"bloque": "Transacciones", "n": int(len(meta)), "share": 1.0},
        {"bloque": "Facturas (DSO/DPO)", "n": int((cov.months_inv > 0).sum()),
         "share": float((cov.months_inv > 0).mean())},
        {"bloque": "Algún producto de deuda", "n": int(meta.has_debt.sum()),
         "share": float(meta.has_debt.mean())},
        {"bloque": "Línea de crédito con `granted`", "n": int(meta.loc_granted.notna().sum()),
         "share": float(meta.loc_granted.notna().mean())},
        {"bloque": "Cuadro de amortización", "n": int(meta.has_schedule.sum()),
         "share": float(meta.has_schedule.mean())},
        {"bloque": "País informado", "n": int(meta.country.notna().sum()),
         "share": float(meta.country.notna().mean())},
        {"bloque": "ERP informado", "n": int(meta.erp.notna().sum()),
         "share": float(meta.erp.notna().mean())},
    ],
})

report.emit("escala", {
    "p90_p10": float(size.outflow_m.quantile(0.9) / max(size.outflow_m.quantile(0.1), 1)),
    "outflow_mediano": float(size.outflow_m.median()),
    "mayor_outflow_mediano": float(size.outflow_m.max()),
    "empresa_mayor": str(size.outflow_m.idxmax()),
    "share_cash_negativa": float((p.cash_eom < 0).mean()),
})

report.emit("senales", {
    "prevalencia": [{"senal": k, "mes": float(p.loc[active, f"f_{k}"].mean()),
                     "empresas": float(p[f"f_{k}"].groupby(p.company_id).any().mean())}
                    for k in flags],
    "estres_compuesto_mes": float(p.loc[active, "stress_now"].mean()),
    "estres_compuesto_empresas": float(p.groupby("company_id").stress_now.any().mean()),
    "etiqueta_fwd12_positivos": float(p.loc[mask, "stress_fwd12"].mean()),
    "etiqueta_fwd12_n": int(mask.sum()),
    "cobertura_pago": [
        {"lado": lado, "utiles": int(p[f"{tag}_util_n"].sum()), "total": int(p[f"{tag}_paid_n"].sum()),
         "share": float(p[f"{tag}_util_n"].sum() / p[f"{tag}_paid_n"].sum()),
         "empresas_20_o_mas": int((p.groupby("company_id")[f"{tag}_util_n"].sum() >= 20).sum())}
        for tag, lado in [("ar", "clientes"), ("ap", "proveedores")]
    ],
})
