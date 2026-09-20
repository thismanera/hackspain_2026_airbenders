"""Detecta trasvases de caja: entre cuentas de la misma empresa y entre
empresas del mismo grupo.

Importa por tres motivos:

- Inflan `inflow` y `outflow`. Un barrido de tesoreria no es actividad, y hay
  empresas con outflow mediano de miles de millones que huelen a eso.
- Contaminan la senal de salud. Una filial a la que el holding le mete caja
  parece liquida sin serlo, y eso es exactamente lo que un score de circulante
  no debe confundir.
- Agravan la fuga por grupo: si las filiales se pasan dinero, sus series no son
  independientes ni de lejos.

Metodo: dos movimientos son un trasvase si tienen el mismo importe absoluto
(redondeado al centimo), signo opuesto, y caen en la misma fecha. Se emparejan
uno a uno dentro de cada clave para no contar de mas. Se reporta ademas una
version estricta (>= 1.000 EUR) porque con importes pequenos la coincidencia
puede ser casualidad.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import report
from fx import product_currency, to_eur

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "dataset"

companies = pd.read_csv(DATA / "companies.csv", usecols=["company_id", "group_id"])
grp = companies.set_index("company_id").group_id
prod_cur = product_currency(DATA)

parts = []
reader = pd.read_csv(DATA / "transactions.csv",
                     usecols=["company_id", "product_id", "date", "amount", "category"],
                     chunksize=500_000, low_memory=False)
for ch in reader:
    ch["eur"] = to_eur(ch.amount, ch.product_id.map(prod_cur))
    ch = ch.dropna(subset=["eur"])
    ch["date"] = pd.to_datetime(ch.date, errors="coerce").dt.normalize()
    ch["abs_amt"] = ch.eur.abs().round(2)
    ch["pos"] = ch.eur > 0
    parts.append(ch[["company_id", "product_id", "date", "eur", "abs_amt", "pos", "category"]])
tx = pd.concat(parts, ignore_index=True)
tx["group_id"] = tx.company_id.map(grp)
print(f"transacciones cargadas: {len(tx):,}")

total_outflow = -tx.loc[~tx.pos, "eur"].sum()


def emparejar(df: pd.DataFrame, claves: list[str], distinto: str) -> pd.DataFrame:
    """Empareja movimientos espejo dentro de cada clave, exigiendo que los dos
    lados vengan de valores distintos de la columna `distinto`."""
    g = df.groupby(claves + ["pos"], observed=True).agg(
        n=("eur", "size"), vol=("abs_amt", "sum"), nun=(distinto, "nunique"),
        primero=(distinto, "first"),
    ).unstack("pos")
    g.columns = [f"{a}_{'pos' if b else 'neg'}" for a, b in g.columns]
    g = g.dropna(subset=["n_pos", "n_neg"])
    if g.empty:
        return g
    # los dos lados tienen que venir de entidades distintas, no de la misma
    distintos = (g.nun_pos + g.nun_neg > 2) | (g.primero_pos != g.primero_neg)
    g = g[distintos]
    g["pares"] = np.minimum(g.n_pos, g.n_neg)
    g["volumen"] = g.pares * (g.vol_pos / g.n_pos)
    return g


print("\n" + "=" * 78)
print("A. TRASVASES ENTRE CUENTAS DE LA MISMA EMPRESA")
print("=" * 78)
intra = emparejar(tx, ["company_id", "date", "abs_amt"], "product_id")
print(f"pares detectados: {intra.pares.sum():,.0f}")
print(f"volumen: {intra.volumen.sum():,.0f} EUR  ({intra.volumen.sum() / total_outflow:.1%} de la salida total)")
print(f"empresas afectadas: {intra.index.get_level_values('company_id').nunique()}")

estricto = intra[intra.index.get_level_values("abs_amt") >= 1000]
print(f"solo importes >= 1.000 EUR: {estricto.pares.sum():,.0f} pares, "
      f"{estricto.volumen.sum():,.0f} EUR ({estricto.volumen.sum() / total_outflow:.1%})")

print("\n" + "=" * 78)
print("B. TRASVASES ENTRE EMPRESAS DEL MISMO GRUPO")
print("=" * 78)
multi = tx[tx.group_id.map(companies.group_id.value_counts()) > 1]
inter = emparejar(multi, ["group_id", "date", "abs_amt"], "company_id")
print(f"pares detectados: {inter.pares.sum():,.0f}")
print(f"volumen: {inter.volumen.sum():,.0f} EUR  ({inter.volumen.sum() / total_outflow:.1%} de la salida total)")
print(f"grupos afectados: {inter.index.get_level_values('group_id').nunique()} "
      f"de {(companies.group_id.value_counts() > 1).sum()} con mas de una empresa")

inter_e = inter[inter.index.get_level_values("abs_amt") >= 1000]
print(f"solo importes >= 1.000 EUR: {inter_e.pares.sum():,.0f} pares, "
      f"{inter_e.volumen.sum():,.0f} EUR ({inter_e.volumen.sum() / total_outflow:.1%})")

print("\n" + "=" * 78)
print("C. CATEGORIAS DE LOS MOVIMIENTOS ESPEJO INTRA-GRUPO")
print("=" * 78)
claves = set(inter_e.index)
m = multi[multi.set_index(["group_id", "date", "abs_amt"]).index.isin(claves)]
print(m.category.value_counts(normalize=True).head(10).round(3).to_string())

print("\n" + "=" * 78)
print("D. DEPENDENCIA: EMPRESAS QUE RECIBEN NETO DE SUS HERMANAS")
print("=" * 78)
dep = pd.DataFrame(columns=["neto", "inflow_total", "dependencia"])
if len(inter_e):
    lado = m.groupby(["company_id", "pos"]).eur.sum().unstack("pos").fillna(0)
    lado.columns = ["salida", "entrada"][: lado.shape[1]] if lado.shape[1] == 2 else lado.columns
    if lado.shape[1] == 2:
        lado["neto"] = lado.entrada + lado.salida
        inflow_tot = tx[tx.pos].groupby("company_id").eur.sum()
        lado["inflow_total"] = inflow_tot.reindex(lado.index)
        lado["dependencia"] = lado.neto / lado.inflow_total
        dep = lado[(lado.neto > 0) & lado.inflow_total.gt(0)].sort_values("dependencia", ascending=False)
        print(f"empresas con neto intragrupo positivo: {len(dep)}")
        print(f"  de ellas, >25% de su entrada total viene del grupo: {(dep.dependencia > 0.25).sum()}")
        print(f"  >50%: {(dep.dependencia > 0.50).sum()}")
        print("\ntop 10 por dependencia:")
        print(dep[["neto", "inflow_total", "dependencia"]].head(10).round(2).to_string())

print("\n" + "=" * 78)
print("E. EFECTO EN LOS OUTLIERS DE TAMANO")
print("=" * 78)
out_emp = tx[~tx.pos].groupby("company_id").eur.sum().abs()
intra_emp = intra.groupby(level="company_id").volumen.sum()
inter_emp = m[~m.pos].groupby("company_id").abs_amt.sum()
top = out_emp.nlargest(10).to_frame("salida_total")
top["espejo_propio"] = intra_emp.reindex(top.index).fillna(0)
top["espejo_grupo"] = inter_emp.reindex(top.index).fillna(0)
top["share_espejo"] = (top.espejo_propio + top.espejo_grupo) / top.salida_total
print(top.assign(
    salida_total=lambda d: d.salida_total.map("{:,.0f}".format),
    espejo_propio=lambda d: d.espejo_propio.map("{:,.0f}".format),
    espejo_grupo=lambda d: d.espejo_grupo.map("{:,.0f}".format),
    share_espejo=lambda d: d.share_espejo.map("{:.1%}".format),
).to_string())

todos = pd.DataFrame({"salida": out_emp})
todos["espejo"] = (intra_emp.reindex(todos.index).fillna(0)
                   + inter_emp.reindex(todos.index).fillna(0))
todos["share"] = (todos.espejo / todos.salida).clip(0, 1)
print(f"\nen el conjunto: {todos.share.median():.1%} de la salida es movimiento espejo "
      f"para la empresa mediana")
print(f"empresas con mas del 50% de su salida en espejos: {(todos.share > 0.5).sum()}")

cats = m.category.value_counts(normalize=True)
report.emit("intragrupo", {
    "pares_misma_empresa": int(intra.pares.sum()),
    "volumen_misma_empresa": float(intra.volumen.sum()),
    "share_misma_empresa": float(intra.volumen.sum() / total_outflow),
    "empresas_misma_empresa": int(intra.index.get_level_values("company_id").nunique()),
    "pares_intragrupo": int(inter.pares.sum()),
    "volumen_intragrupo": float(inter.volumen.sum()),
    "share_intragrupo": float(inter.volumen.sum() / total_outflow),
    "share_intragrupo_estricto": float(inter_e.volumen.sum() / total_outflow),
    "grupos_afectados": int(inter.index.get_level_values("group_id").nunique()),
    "grupos_multiempresa": int((companies.group_id.value_counts() > 1).sum()),
    "share_categoria_transfer": float(cats.get("transfer", 0.0)),
    "share_categorias_operativas": float(cats.get("payment", 0.0) + cats.get("collection", 0.0)),
    "share_sin_categoria": float(cats.get("-", 0.0)),
    "share_espejo_empresa_mediana": float(todos.share.median()),
    "empresas_espejo_mayoritario": int((todos.share > 0.5).sum()),
    "dependencia": {
        "con_neto_positivo": int(len(dep)),
        "mas_de_25": int((dep.dependencia > 0.25).sum()),
        "mas_de_50": int((dep.dependencia > 0.50).sum()),
        "mas_de_90": int((dep.dependencia > 0.90).sum()),
    },
})
