"""Regenera los bloques numericos de FINDINGS.md a partir de metrics.json.

La prosa del documento se escribe a mano. Los numeros no: se inyectan entre
marcadores `<!-- AUTO:seccion -->` y `<!-- /AUTO -->`, de modo que no puedan
quedarse obsoletos cuando cambie el pipeline. Si alguien edita a mano lo que
hay dentro de un bloque, la siguiente ejecucion lo sobreescribe.

Uso:
    python analysis/06_report.py            # reescribe FINDINGS.md
    python analysis/06_report.py --check    # falla si esta desactualizado
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import report

HERE = Path(__file__).resolve().parent
DOC = HERE / "FINDINGS.md"


def bloque_cobertura(m: dict) -> str:
    c = m["cobertura"]
    rows = [{"bloque": b["bloque"], "n": f"{b['n']:,}".replace(",", "."),
             "share": report.pct(b["share"])} for b in c["bloques"]]
    return report.table(rows, {"bloque": "Bloque", "n": "Empresas", "share": "%"}, align="right")


def bloque_trayectoria(m: dict) -> str:
    t = m["trayectoria"]
    rows = [{"senal": f"`{r['senal']}`", "nivel": report.num(r["nivel"]),
             "tendencia": report.num(r["tendencia"]), "nula": report.num(r["nula_p95"])}
            for r in t["persistencia"]]
    return report.table(rows, {"senal": "Señal", "nivel": "Persistencia de nivel",
                               "tendencia": "Persistencia de tendencia", "nula": "Nula p95"},
                        align="right")


def bloque_senales(m: dict) -> str:
    s = m["senales"]
    rows = [{"senal": r["senal"], "mes": report.pct(r["mes"], 2), "emp": report.pct(r["empresas"])}
            for r in s["prevalencia"]]
    return report.table(rows, {"senal": "Señal", "mes": "% empresa-mes",
                               "emp": "% empresas alguna vez"}, align="right")


def bloque_clave(m: dict) -> str:
    c, e, s, t = m["cobertura"], m["escala"], m["senales"], m["trayectoria"]
    comp = t["indice_compuesto"]
    fuera = t["por_encima_de_nula"]
    veredicto = (f"{t['n_dentro_de_nula']} de {t['n_senales']} señales dentro de la nula"
                 + (f"; roza el límite: {', '.join('`' + f['senal'] + '`' for f in fuera)}"
                    if fuera else ""))
    rows = [
        {"k": "Empresas / grupos", "v": f"{c['empresas']:,} en {c['grupos']}".replace(",", ".")},
        {"k": "Empresas que comparten grupo", "v": report.pct(c["share_comparte_grupo"])},
        {"k": "Meses de historia (mediana)", "v": f"{c['meses_mediana']:.0f} de 25"},
        {"k": "Empresas con 7–12 meses", "v": f"{c['empresas_7_12_meses']}"},
        {"k": "Etiqueta estrés a 12m (positivos)",
         "v": f"{report.pct(s['etiqueta_fwd12_positivos'])} sobre "
              f"{f'{s['etiqueta_fwd12_n']:,}'.replace(',', '.')} filas"},
        {"k": "Dispersión de tamaño (p90/p10)", "v": f"{e['p90_p10']:,.0f}x".replace(",", ".")},
        {"k": "Meses con caja reconstruida negativa", "v": report.pct(e["share_cash_negativa"])},
        {"k": "Persistencia de nivel del índice", "v": report.num(comp["persist_nivel"])},
        {"k": "Persistencia de tendencia del índice", "v": report.num(comp["persist_tendencia"])},
        {"k": "ACF trimestral del índice (lags 1–4)",
         "v": ", ".join(report.num(comp["acf"][f"lag{i}"], 2) for i in (1, 2, 3, 4))},
        {"k": "Veredicto de tendencia", "v": veredicto},
    ]
    return report.table(rows, {"k": "Cifra", "v": "Valor"})


def bloque_validaciones(m: dict) -> str:
    v = m["validaciones"]
    d, p, c = v["direccion_factura"], v["payment_date"], v["cartera_viva"]
    rows = [
        {"k": "Importe negativo = proveedor",
         "v": f"{report.pct(d['negativa_es_proveedor'])} de {d['n_negativa']:,} pares".replace(",", ".")},
        {"k": "Importe positivo = cliente",
         "v": f"{report.pct(d['positiva_es_cliente'])} de {d['n_positiva']:,} pares".replace(",", ".")},
        {"k": "Facturas con `payment_date` == `due_date`", "v": report.pct(p["share_igual_due_date"])},
        {"k": "Idem dentro de las `overdue`",
         "v": f"{report.pct(p['share_igual_en_overdue'])} (y son el "
              f"{report.pct(p['share_overdue_en_fichero'])} del fichero)"},
        {"k": "Facturas con fecha de pago útil",
         "v": f"{report.pct(p['share_utiles'])} ({p['facturas_utiles']:,})".replace(",", ".")},
        {"k": "Retraso mediano en las útiles",
         "v": f"{p['retraso_mediano_utiles']:.0f} días (p95: {p['retraso_p95_utiles']:.0f})"},
        {"k": "Empresas con ≥20 facturas útiles",
         "v": f"{p['empresas_con_20_utiles']} de {p['empresas_con_facturas']}"},
        {"k": "Cartera viva (`pending_amount` > 0)",
         "v": f"{report.pct(c['share_facturas_pendientes'])} de las facturas, en {c['empresas']} empresas"},
    ]
    return report.table(rows, {"k": "Comprobación", "v": "Resultado"})


def bloque_intragrupo(m: dict) -> str:
    g = m["intragrupo"]
    d = g["dependencia"]
    mill = lambda x: f"{x / 1e6:,.0f} M€".replace(",", ".")  # noqa: E731
    rows = [
        {"k": "Espejos entre cuentas de la misma empresa",
         "v": f"{g['pares_misma_empresa']:,} pares, {mill(g['volumen_misma_empresa'])}, "
              f"{report.pct(g['share_misma_empresa'])} de la salida".replace(",", ".", 1)},
        {"k": "Espejos entre empresas del mismo grupo",
         "v": f"{g['pares_intragrupo']:,} pares, {mill(g['volumen_intragrupo'])}, "
              f"{report.pct(g['share_intragrupo'])} de la salida".replace(",", ".", 1)},
        {"k": "Grupos multiempresa que trasvasan",
         "v": f"{g['grupos_afectados']} de {g['grupos_multiempresa']}"},
        {"k": "Espejos etiquetados como `transfer`", "v": report.pct(g["share_categoria_transfer"])},
        {"k": "Espejos colados como `payment` o `collection`",
         "v": report.pct(g["share_categorias_operativas"])},
        {"k": "Espejos en la empresa mediana", "v": report.pct(g["share_espejo_empresa_mediana"])},
        {"k": "Empresas con >50% de su salida en espejos", "v": str(g["empresas_espejo_mayoritario"])},
        {"k": "Empresas con entrada neta del grupo", "v": str(d["con_neto_positivo"])},
        {"k": "…que dependen del grupo en >25% / >50% / >90% de su entrada",
         "v": f"{d['mas_de_25']} / {d['mas_de_50']} / {d['mas_de_90']}"},
    ]
    return report.table(rows, {"k": "Medida", "v": "Valor"})


def bloque_categorias(m: dict) -> str:
    c = m["categorias"]
    rows = [
        {
            "k": "Sin categoría original",
            "v": f"{c['sin_categoria_original']:,} "
                 f"({report.pct(c['share_sin_categoria_original'], 2)})".replace(",", "."),
        },
        {
            "k": "Clasificadas con confianza",
            "v": f"{c['clasificadas']:,} ({report.pct(c['share_clasificadas'])})".replace(",", "."),
        },
        {
            "k": "Volumen sin categoría recuperado",
            "v": report.pct(c["share_volumen_clasificado"]),
        },
        {
            "k": "Se mantienen como `unknown`",
            "v": f"{c['unknown']:,}".replace(",", "."),
        },
        {
            "k": "Categorías nuevas",
            "v": ", ".join(f"`{name}`" for name in c["new_categories"]),
        },
    ]
    return report.table(rows, {"k": "Medida", "v": "Valor"})


BLOQUES = {
    "clave": bloque_clave,
    "intragrupo": bloque_intragrupo,
    "categorias": bloque_categorias,
    "cobertura": bloque_cobertura,
    "trayectoria": bloque_trayectoria,
    "senales": bloque_senales,
    "validaciones": bloque_validaciones,
}


def _sustituir(texto: str, nombre: str, contenido: str) -> str:
    """Reemplaza el interior de un bloque AUTO. El contenido llega hasta el
    primer cierre, para que un bloque vacio no se coma el marcador siguiente."""
    patron = re.compile(rf"(<!-- AUTO:{nombre} -->\n)((?:(?!<!-- /AUTO -->).)*)(<!-- /AUTO -->)",
                        re.DOTALL)
    if not patron.search(texto):
        raise SystemExit(f"Falta el marcador <!-- AUTO:{nombre} --> en {DOC.name}")
    return patron.sub(lambda mt: mt.group(1) + contenido + "\n" + mt.group(3), texto)


def render(texto: str, m: dict) -> str:
    for nombre, fn in BLOQUES.items():
        texto = _sustituir(texto, nombre, fn(m))
    meta = m.get("_meta", {})
    return _sustituir(texto, "meta", f"Cifras generadas el {meta.get('generado', '?')} "
                                     f"desde el commit `{meta.get('commit', '?')}`.")


def main() -> None:
    m = report.load()
    actual = DOC.read_text(encoding="utf-8")
    nuevo = render(actual, m)
    if "--check" in sys.argv:
        if actual != nuevo:
            raise SystemExit("FINDINGS.md esta desactualizado. Ejecuta: python analysis/06_report.py")
        print("FINDINGS.md al dia.")
        return
    DOC.write_text(nuevo, encoding="utf-8")
    print(f"{DOC.name} actualizado con las cifras de metrics.json")


if __name__ == "__main__":
    main()
