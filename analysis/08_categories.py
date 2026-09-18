"""Normaliza y completa la categoria de las transacciones sin etiquetar.

La prioridad es conservadora:

1. preservar categorias originales y normalizar alias;
2. reutilizar una categoria existente cuando una plantilla de descripcion tiene
   al menos MIN_TEMPLATE_SUPPORT ejemplos etiquetados y >= MIN_PRECISION de
   pureza;
3. aplicar reglas de texto solo si alcanzan esa misma precision al contrastarlas
   contra las filas ya etiquetadas;
4. crear ``debt_drawdown`` o ``balance_adjustment`` unicamente para conceptos
   que no existen en la taxonomia original;
5. dejar ``unknown`` antes que inventar una etiqueta dudosa.

Salida: ``analysis/transaction_categories.parquet``. Es un artefacto derivado:
una fila por transaccion con categoria original, normalizada, fuente y confianza.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import report
from fx import product_currency, to_eur

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / "dataset"
OUTPUT = HERE / "transaction_categories.parquet"

MIN_PRECISION = 0.95
MIN_RULE_SUPPORT = 25
MIN_TEMPLATE_SUPPORT = 5

CANONICAL_CATEGORIES = {
    "collection",
    "bulk_collection",
    "payment",
    "bulk_payment",
    "fee",
    "utility",
    "transfer",
    "cash_settlement",
    "tax",
    "pos_settlement",
    "debt_repayment",
    "salary",
    "cash_withdrawal",
    "collection_refund",
    "social_security",
    "interest_charge",
    "pos_withdrawal",
    "investment_deployment",
    "payment_refund",
    "investment_return",
    "tax_refund",
}

CATEGORY_ALIASES = {
    "cash_settlements": "cash_settlement",
}

NEW_CATEGORIES = {"debt_drawdown", "balance_adjustment"}


@dataclass(frozen=True)
class Rule:
    name: str
    category: str
    pattern: str
    direction: str = "any"


# Las reglas genericas se validan contra las etiquetas originales antes de
# poder tocar una fila sin categoria. El orden va de conceptos especificos a
# genericos para resolver coincidencias multiples.
CANDIDATE_RULES = [
    Rule("collection_refund", "collection_refund", r"REFUND.*COLLECTION|DEVOLUCI.N.*COBRO"),
    Rule("payment_refund", "payment_refund", r"REFUND.*PAYMENT|PAGO.*DEVOLUCI.N|DEVOLUCI.N.*PAGO"),
    Rule("tax_refund", "tax_refund", r"TAX REFUND|DEVOLUCI.N.*(?:IMPUEST|HACIENDA|AEAT)", "positive"),
    Rule("social_security", "social_security", r"SEGURIDAD SOCIAL|SOCIAL SECURITY", "negative"),
    Rule("debt_repayment", "debt_repayment", r"LOAN (?:PRINCIPAL|REPAYMENT)|REPAYMENT.*LOAN|AMORTIZACI.N.*(?:PR.STAMO|CREDITO)", "negative"),
    Rule("salary", "salary", r"\bNOMINAS?\b|\bPAYROLL\b|\bSALAR(?:Y|IES)\b", "negative"),
    Rule("cash_withdrawal", "cash_withdrawal", r"\bATM\b|CASH WITHDRAWAL|RETIRADA.*EFECTIVO", "negative"),
    Rule("cash_settlement", "cash_settlement", r"LIQUIDACI.N POR NETEO|\bNETTING\b|CASH SETTLEMENT"),
    Rule("transfer", "transfer", r"\bTRANSFER(?:ENCIA)?\b|\bTRASPASO\b|\bVIREMENT\b|\bWIRE\b|CASH POOL|COMPRAVENTA DE DIVISA|TOP UP"),
    Rule("interest_charge", "interest_charge", r"\bINTERESES?\b|\bINTEREST\b", "negative"),
    Rule("fee", "fee", r"\bCOMISI(?:ON|ONES)\b|\bCOMMISSIONS?\b|\bFEES?\b", "negative"),
    Rule("tax", "tax", r"\bIMPUESTOS?\b|\bTAX\b|\bAEAT\b|\bHACIENDA\b", "negative"),
    Rule("utility", "utility", r"ELECTRIC|ENERG|WATER|\bAGUA\b|TELEF|INTERNET|\bGAS\b", "negative"),
    Rule("payment", "payment", r"\bPAGO\b|\bPAYMENT\b|\bPROVEEDOR(?:ES)?\b|\bDIRECT DEBIT\b|\bRECIBO\b", "negative"),
    Rule("collection", "collection", r"\bCOBRO\b|\bCOLLECTION\b|\bABONO\b|\bINGRESO\b|INCOMING PAYMENT", "positive"),
]

# No tienen equivalente semantico en la taxonomia original. Son deliberadamente
# mas estrictas que las reglas anteriores y solo se prueban sobre el residuo.
NEW_CATEGORY_RULES = [
    Rule(
        "debt_drawdown",
        "debt_drawdown",
        r"DISPOSICI.N.*(?:TERM LOAN|PR.STAMO|CREDITO)|(?:LOAN|CREDIT).*(?:DRAWDOWN|DISBURSEMENT)|ABONO POR DISPOSICI.N",
        "positive",
    ),
    Rule(
        "balance_adjustment",
        "balance_adjustment",
        r"MANUAL QUITAR RETENCI.N|AJUSTE RETENCI.N|SCF[- ]?AJUS\.?SALDO|AJUSTE DE SALDO|BALANCE ADJUSTMENT",
    ),
]


def normalize_text(description: pd.Series) -> pd.Series:
    """Reduce referencias variables sin borrar las palabras con significado."""
    text = description.fillna("").astype("string").str.upper()
    text = text.str.replace(
        r"\[(?:X|NUM|REF|COMPANY|NAME|ADDRESS|IBAN|TAXID|PERSON|CARD|ACCOUNT)\]",
        " ",
        regex=True,
    )
    text = text.str.replace(r"\d+", " # ", regex=True)
    text = text.str.replace(r"[^A-ZÁÉÍÓÚÜÑ#]+", " ", regex=True)
    return text.str.replace(r"\s+", " ", regex=True).str.strip()


def direction_mask(amount: pd.Series, direction: str) -> pd.Series:
    if direction == "positive":
        return amount > 0
    if direction == "negative":
        return amount < 0
    return pd.Series(True, index=amount.index)


def rule_mask(df: pd.DataFrame, rule: Rule) -> pd.Series:
    return (
        df["description"].fillna("").str.contains(rule.pattern, case=False, regex=True)
        & direction_mask(df["amount"], rule.direction)
    )


def learn_templates(labeled: pd.DataFrame) -> pd.DataFrame:
    """Obtiene categoria dominante y pureza sin lambdas por grupo."""
    usable = labeled[labeled["template"].ne("")]
    counts = usable.groupby(["template", "canonical_original"], observed=True).size().rename("n")
    totals = counts.groupby(level="template").sum().rename("total")
    top = (
        counts.reset_index()
        .sort_values(["template", "n"], ascending=[True, False])
        .drop_duplicates("template")
        .set_index("template")
    )
    top["total"] = totals
    top["precision"] = top["n"] / top["total"]
    return top[
        (top["total"] >= MIN_TEMPLATE_SUPPORT) & (top["precision"] >= MIN_PRECISION)
    ][["canonical_original", "total", "precision"]]


def validate_rules(labeled: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for rule in CANDIDATE_RULES:
        hit = rule_mask(labeled, rule)
        support = int(hit.sum())
        correct = int((labeled.loc[hit, "canonical_original"] == rule.category).sum())
        precision = correct / support if support else 0.0
        rows.append(
            {
                "rule": rule.name,
                "category": rule.category,
                "support": support,
                "precision": precision,
                "active": support >= MIN_RULE_SUPPORT and precision >= MIN_PRECISION,
            }
        )
    return pd.DataFrame(rows)


def main() -> None:
    usecols = ["transaction_id", "product_id", "amount", "category", "description"]
    tx = pd.read_csv(DATA / "transactions.csv", usecols=usecols, low_memory=False)
    tx["eur_abs"] = to_eur(tx["amount"], tx["product_id"].map(product_currency(DATA))).abs()
    tx["original_category"] = tx["category"].astype("string")
    stripped = tx["original_category"].str.strip()
    tx["is_uncategorized"] = stripped.isna() | stripped.isin(["", "-"])
    tx["canonical_original"] = stripped.replace(CATEGORY_ALIASES)

    unexpected = sorted(
        set(tx.loc[~tx["is_uncategorized"], "canonical_original"].dropna())
        - CANONICAL_CATEGORIES
    )
    if unexpected:
        raise SystemExit(f"Categorias originales sin normalizar: {unexpected}")

    tx["template"] = normalize_text(tx["description"])
    labeled = tx[~tx["is_uncategorized"]]
    templates = learn_templates(labeled)
    audit = validate_rules(labeled)

    tx["normalized_category"] = tx["canonical_original"]
    tx["category_source"] = np.where(
        tx["is_uncategorized"],
        "unknown",
        np.where(stripped.isin(CATEGORY_ALIASES), "alias", "original"),
    )
    tx["category_confidence"] = np.where(tx["is_uncategorized"], 0.0, 1.0)

    unresolved = tx["is_uncategorized"].copy()
    template_category = tx["template"].map(templates["canonical_original"])
    template_precision = tx["template"].map(templates["precision"])
    hit = unresolved & template_category.notna()
    tx.loc[hit, "normalized_category"] = template_category[hit]
    tx.loc[hit, "category_source"] = "description_template"
    tx.loc[hit, "category_confidence"] = template_precision[hit]
    unresolved &= ~hit

    active_rules = audit[audit["active"]].set_index("rule")
    for rule in CANDIDATE_RULES:
        if rule.name not in active_rules.index:
            continue
        hit = unresolved & rule_mask(tx, rule)
        tx.loc[hit, "normalized_category"] = rule.category
        tx.loc[hit, "category_source"] = "description_rule"
        tx.loc[hit, "category_confidence"] = active_rules.loc[rule.name, "precision"]
        unresolved &= ~hit

    for rule in NEW_CATEGORY_RULES:
        hit = unresolved & rule_mask(tx, rule)
        tx.loc[hit, "normalized_category"] = rule.category
        tx.loc[hit, "category_source"] = "new_category"
        # Estas reglas son semanticas y no tienen ejemplos originales con los
        # que estimar precision. 0.90 las distingue de confianza validada.
        tx.loc[hit, "category_confidence"] = 0.90
        unresolved &= ~hit

    tx.loc[unresolved, "normalized_category"] = "unknown"

    output_columns = [
        "transaction_id",
        "original_category",
        "normalized_category",
        "category_source",
        "category_confidence",
    ]
    tx[output_columns].to_parquet(OUTPUT, index=False)

    inferred = tx["is_uncategorized"] & ~unresolved
    original_uncategorized = int(tx["is_uncategorized"].sum())
    by_source = (
        tx.loc[tx["is_uncategorized"]]
        .groupby("category_source", observed=True)
        .agg(n=("transaction_id", "size"), volume_eur=("eur_abs", "sum"))
        .sort_values("n", ascending=False)
        .rename_axis("source")
        .reset_index()
    )
    by_category = (
        tx.loc[inferred]
        .groupby("normalized_category", observed=True)
        .agg(n=("transaction_id", "size"), volume_eur=("eur_abs", "sum"))
        .sort_values("n", ascending=False)
        .rename_axis("category")
        .reset_index()
    )
    uncategorized_volume = float(tx.loc[tx["is_uncategorized"], "eur_abs"].sum())
    inferred_volume = float(tx.loc[inferred, "eur_abs"].sum())

    print(f"transacciones: {len(tx):,}")
    print(f"sin categoria original: {original_uncategorized:,}")
    print(
        f"clasificadas: {int(inferred.sum()):,} ({inferred.sum() / original_uncategorized:.1%}); "
        f"{inferred_volume:,.0f} EUR ({inferred_volume / uncategorized_volume:.1%} del volumen sin categoria)"
    )
    print(f"se mantienen unknown: {int(unresolved.sum()):,}")
    print("\nReglas existentes (solo se aplican las activas):")
    print(
        audit.assign(precision=audit["precision"].map("{:.1%}".format)).to_string(index=False)
    )
    print("\nResultado por fuente:")
    print(by_source.to_string(index=False))
    print("\nResultado inferido por categoria:")
    print(by_category.to_string(index=False))
    print(f"\nArtefacto escrito: {OUTPUT}")

    report.emit(
        "categorias",
        {
            "transacciones": int(len(tx)),
            "sin_categoria_original": original_uncategorized,
            "share_sin_categoria_original": float(original_uncategorized / len(tx)),
            "clasificadas": int(inferred.sum()),
            "share_clasificadas": float(inferred.sum() / original_uncategorized),
            "volumen_sin_categoria_eur": uncategorized_volume,
            "volumen_clasificado_eur": inferred_volume,
            "share_volumen_clasificado": float(inferred_volume / uncategorized_volume),
            "unknown": int(unresolved.sum()),
            "by_source": by_source.to_dict(orient="records"),
            "by_category": by_category.to_dict(orient="records"),
            "rule_audit": audit.to_dict(orient="records"),
            "new_categories": sorted(NEW_CATEGORIES),
        },
    )


if __name__ == "__main__":
    main()
