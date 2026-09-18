"""Hay trayectoria de verdad en el dataset, o el ruido mensual es blanco?

El primer diagnostico decia que la pendiente de la primera mitad no predice la
de la segunda. Antes de darlo por bueno hay que descartar tres explicaciones
alternativas:

- outliers brutales (el panel tiene colas absurdas) -> se usan rangos
  cross-seccionales por mes en vez de niveles
- ruido mensual que tapa una deriva lenta -> se agrega a trimestres
- azar -> test de permutacion: se baraja el orden temporal dentro de cada
  empresa y se compara la persistencia real contra la nula

Tambien se comprueba el artefacto de onboarding: si la actividad agregada crece
con el calendario, cualquier feature de tendencia mide "cuando se conecto esta
empresa", no su salud.
"""

from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
FIG = HERE / "figures"
rng = np.random.default_rng(7)

p = pd.read_parquet(HERE / "panel_features.parquet")
meta = pd.read_parquet(HERE / "companies_meta.parquet")
p["month"] = pd.to_datetime(p.month)

print("=" * 78)
print("A. ARTEFACTO DE ONBOARDING")
print("=" * 78)
cal = p[p.has_tx].groupby("month").agg(
    empresas_activas=("company_id", "nunique"),
    tx=("tx_n", "sum"),
    facturas=("ar_n", "sum"),
)
cal["tx_por_empresa"] = (cal.tx / cal.empresas_activas).round(0)
print(cal.to_string())
first = p[p.has_tx].groupby("company_id").month.min()
print("\nmes de primera actividad (empresas por mes):")
print(first.dt.to_period("M").value_counts().sort_index().to_string())

print("\n" + "=" * 78)
print("B. PERSISTENCIA CON RANGOS Y TRIMESTRES")
print("=" * 78)

FEATS = ["cash_days", "net_margin", "fee_ratio", "ap_days_late", "ar_days_late",
         "ar_dso", "ar_hhi", "outflow", "inflow", "unpaid_rate"]

q = p[p.has_tx].copy()
q["quarter"] = q.month.dt.to_period("Q")
qa = q.groupby(["company_id", "quarter"])[FEATS].mean().reset_index()

# rango cross-seccional por trimestre: mata escala y outliers de golpe
for c in FEATS:
    qa[c] = qa.groupby("quarter")[c].rank(pct=True)

wide = {c: qa.pivot(index="company_id", columns="quarter", values=c).sort_index(axis=1) for c in FEATS}


def slopes(d: pd.DataFrame, min_obs: int = 3) -> pd.Series:
    x = np.arange(d.shape[1], dtype=float)
    vals = d.to_numpy(dtype=float)
    out = np.full(len(d), np.nan)
    for i in range(len(d)):
        ok = ~np.isnan(vals[i])
        if ok.sum() >= min_obs:
            out[i] = np.polyfit(x[ok], vals[i][ok], 1)[0]
    return pd.Series(out, index=d.index)


def persistence(d: pd.DataFrame) -> tuple[float, float, int]:
    half = d.shape[1] // 2
    s1, s2 = slopes(d.iloc[:, :half]), slopes(d.iloc[:, half:])
    both = pd.concat([s1, s2], axis=1).dropna()
    lvl = pd.concat([d.iloc[:, :half].mean(axis=1), d.iloc[:, half:].mean(axis=1)], axis=1).dropna()
    return (both.corr().iloc[0, 1] if len(both) > 50 else np.nan,
            lvl.corr().iloc[0, 1] if len(lvl) > 50 else np.nan,
            len(both))


rows = []
for c in FEATS:
    d = wide[c]
    tr, lv, n = persistence(d)
    # nula por permutacion: baraja columnas dentro de cada empresa
    null = []
    for _ in range(30):
        vals = np.array(d.to_numpy(dtype=float), copy=True)
        for i in range(len(vals)):
            ok = ~np.isnan(vals[i])
            idx = np.where(ok)[0]
            vals[i][idx] = vals[i][rng.permutation(idx)]
        null.append(persistence(pd.DataFrame(vals, index=d.index, columns=d.columns))[0])
    rows.append({"feature": c, "n": n, "persist_nivel": lv, "persist_tendencia": tr,
                 "nula_media": np.nanmean(null), "nula_p95": np.nanpercentile(null, 95)})

res = pd.DataFrame(rows).set_index("feature").round(3)
print("persist_nivel      = corr(media 1a mitad, media 2a mitad)  -> 'que tipo de empresa es'")
print("persist_tendencia  = corr(pendiente 1a mitad, pendiente 2a mitad) -> 'va hacia algun lado'")
print("nula_*             = lo mismo tras barajar el tiempo dentro de cada empresa\n")
print(res.to_string())

print("\n" + "=" * 78)
print("C. AR(1) DEL INDICE COMPUESTO")
print("=" * 78)
# indice de salud simple con rangos: mas caja y margen mejor, mas retraso/comisiones peor
comp = (
    qa.set_index(["company_id", "quarter"])
    .assign(h=lambda d: (d.cash_days.fillna(0.5) + d.net_margin.fillna(0.5)
                         + (1 - d.ap_days_late.fillna(0.5)) + (1 - d.fee_ratio.fillna(0.5))
                         + (1 - d.unpaid_rate.fillna(0.5))) / 5)
    .h.unstack("quarter").sort_index(axis=1)
)
dev = comp.sub(comp.mean(axis=1), axis=0)
for lag in (1, 2, 3, 4):
    a = dev.iloc[:, :-lag].stack()
    b = dev.shift(-lag, axis=1).iloc[:, :-lag].stack()
    both = pd.concat([a, b], axis=1).dropna()
    print(f"  acf trimestral lag {lag}: {both.corr().iloc[0, 1]:+.3f}  (n={len(both)})")
tr, lv, n = persistence(comp)
print(f"\nindice compuesto -> persistencia de nivel {lv:+.3f} | de tendencia {tr:+.3f} (n={n})")

print("\n" + "=" * 78)
print("D. OUTLIERS: son reales?")
print("=" * 78)
big = p.groupby("company_id").outflow.median().nlargest(8)
print("empresas con mayor outflow mensual mediano:")
print(pd.concat([big.rename("outflow_med"),
                 meta.set_index("company_id").currency.reindex(big.index)], axis=1).to_string())
print(f"\nceldas con |cash_days| > 10.000: {(p.cash_days.abs() > 10_000).sum()}")
print(f"celdas con cash_eom < 0        : {(p.cash_eom < 0).sum()}  ({(p.cash_eom < 0).mean():.1%})")

fig, ax = plt.subplots(1, 3, figsize=(16, 4.2))
cal.empresas_activas.plot(ax=ax[0], marker="o", color="#2b6cb0")
ax[0].set_title("Empresas con actividad por mes")
ax[0].set_ylim(0)
res[["persist_tendencia", "nula_p95"]].plot.barh(ax=ax[1], color=["#c05621", "#a0aec0"])
ax[1].axvline(0, color="k", lw=0.8)
ax[1].set_title("Persistencia de tendencia vs nula (p95)")
res[["persist_nivel"]].sort_values("persist_nivel").plot.barh(ax=ax[2], color="#2f855a", legend=False)
ax[2].set_title("Persistencia de nivel")
plt.tight_layout()
plt.savefig(FIG / "trend_vs_noise.png", dpi=130)
print(f"\nfigura -> {FIG / 'trend_vs_noise.png'}")
