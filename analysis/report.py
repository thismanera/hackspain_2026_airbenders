"""Recoge las cifras clave de los scripts y las vuelca en analysis/metrics.json.

Existe por un motivo concreto: las cifras de FINDINGS.md se copiaron a mano una
vez y se quedaron obsoletas en cuanto cambio el pipeline. Un documento con
numeros que no cuadran con el log adjunto no lo cree nadie, y con razon.

A partir de aqui cada script emite sus metricas aqui, y 06_report.py regenera
los bloques numericos de FINDINGS.md a partir de este fichero. La prosa se
escribe a mano; los numeros, nunca.
"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
METRICS = HERE / "metrics.json"


def _git_sha() -> str:
    try:
        out = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=HERE.parent,
                             capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or "desconocido"
    except (OSError, subprocess.SubprocessError):
        return "desconocido"


def emit(section: str, payload: dict[str, Any]) -> None:
    data = json.loads(METRICS.read_text(encoding="utf-8")) if METRICS.exists() else {}
    data[section] = payload
    data["_meta"] = {"generado": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                     "commit": _git_sha()}
    METRICS.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[metrics] seccion '{section}' actualizada en {METRICS.name}")


def load() -> dict[str, Any]:
    if not METRICS.exists():
        raise SystemExit("No hay metrics.json. Ejecuta 02_balance.py y 03_trend.py antes.")
    return json.loads(METRICS.read_text(encoding="utf-8"))


def table(rows: list[dict[str, Any]], headers: dict[str, str], align: str = "left") -> str:
    """Renderiza una tabla markdown. `headers` mapea clave -> titulo."""
    keys = list(headers)
    sep = {"left": "---", "right": "---:"}[align]
    out = ["| " + " | ".join(headers.values()) + " |",
           "| " + " | ".join([("---" if i == 0 else sep) for i in range(len(keys))]) + " |"]
    for r in rows:
        out.append("| " + " | ".join(str(r.get(k, "")) for k in keys) + " |")
    return "\n".join(out)


def pct(x: float, dec: int = 1) -> str:
    return f"{x * 100:.{dec}f}%".replace(".", ",")


def num(x: float, dec: int = 3) -> str:
    return f"{x:.{dec}f}".replace(".", ",")
