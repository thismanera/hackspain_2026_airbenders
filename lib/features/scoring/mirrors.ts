import type { Product, Tx } from "@/lib/features/scoring/types";

export type MirrorKind = "interno" | "intragrupo";

/** Cuentas cuyos movimientos son flujo operativo (§3.3). */
const OPERATIVAS = new Set(["checking", "saving", "wallet"]);

/**
 * Deja solo los movimientos de cuentas operativas. El emparejamiento de espejos NO debe ver
 * movimientos de `lineofcredit`, tarjetas ni productos desconocidos: una disposición de crédito y
 * su abono en la cuenta corriente tienen el mismo importe y fecha y se emparejarían como traspaso
 * interno, borrando la disposición. `prepareGroup` (el orquestador) debe aplicar este filtro antes
 * de llamar a `pairMirrors`, o pasarle `products` para que lo haga por dentro.
 */
export function operatingOnly(txs: Tx[], products: Map<string, Product>): Tx[] {
  return txs.filter((t) => {
    const p = products.get(t.product);
    return !!p && OPERATIVAS.has(p.type);
  });
}

/**
 * txs = todos los movimientos booked de un grupo empresarial (solo cuentas operativas: se filtran
 * aquí si se pasa `products`, si no debe haberlo hecho ya el llamante con `operatingOnly`).
 * Clave `(|importe_eur| al céntimo, date)`; los positivos son el ancla greedy: se recorren en orden
 * de id y cada uno toma el negativo libre de menor id, primero de su propia empresa (traspaso
 * interno) y si no lo hay de otra empresa del grupo (intragrupo). Devuelve id → tipo de espejo.
 */
export function pairMirrors(txs: Tx[], products?: Map<string, Product>): Map<string, MirrorKind> {
  const source = products ? operatingOnly(txs, products) : txs;
  const buckets = new Map<string, { pos: Tx[]; neg: Tx[] }>();
  for (const t of source) {
    if (t.amount === null || t.amount === 0) continue;
    const key = `${Math.round(Math.abs(t.amount) * 100)}|${t.date}`;
    const b = buckets.get(key) ?? { pos: [], neg: [] };
    (t.amount > 0 ? b.pos : b.neg).push(t);
    buckets.set(key, b);
  }
  const out = new Map<string, MirrorKind>();
  const byId = (a: Tx, b: Tx) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  for (const { pos, neg } of buckets.values()) {
    pos.sort(byId);
    // Negativos indexados por empresa, cada lista con su cursor: lo ya consumido nunca se revisita.
    const byCompany = new Map<string, Tx[]>();
    for (const n of [...neg].sort(byId)) {
      const list = byCompany.get(n.company) ?? [];
      list.push(n);
      byCompany.set(n.company, list);
    }
    const cursor = new Map<string, number>();
    const head = (company: string): Tx | undefined =>
      byCompany.get(company)?.[cursor.get(company) ?? 0];
    for (const p of pos) {
      let partner = head(p.company);
      if (!partner)
        for (const company of byCompany.keys()) {
          if (company === p.company) continue;
          const candidate = head(company);
          if (candidate && (!partner || candidate.id < partner.id)) partner = candidate;
        }
      if (!partner) continue;
      cursor.set(partner.company, (cursor.get(partner.company) ?? 0) + 1);
      const kind: MirrorKind = partner.company === p.company ? "interno" : "intragrupo";
      out.set(p.id, kind);
      out.set(partner.id, kind);
    }
  }
  return out;
}
