import type { Tx } from "@/lib/features/scoring/types";

export type MirrorKind = "interno" | "intragrupo";

/** txs = todos los movimientos booked de un grupo empresarial. Devuelve id → tipo de espejo. */
export function pairMirrors(txs: Tx[]): Map<string, MirrorKind> {
  const buckets = new Map<string, { pos: Tx[]; neg: Tx[] }>();
  for (const t of txs) {
    if (t.amount === null || t.amount === 0) continue;
    const key = `${Math.round(Math.abs(t.amount) * 100)}|${t.date}`;
    const b = buckets.get(key) ?? { pos: [], neg: [] };
    (t.amount > 0 ? b.pos : b.neg).push(t);
    buckets.set(key, b);
  }
  const out = new Map<string, MirrorKind>();
  const byId = (a: Tx, b: Tx) => a.id.localeCompare(b.id);
  for (const { pos, neg } of buckets.values()) {
    pos.sort(byId);
    neg.sort(byId);
    for (const p of pos) {
      const same = neg.find((n) => !out.has(n.id) && n.company === p.company);
      const partner = same ?? neg.find((n) => !out.has(n.id) && n.company !== p.company);
      if (!partner) continue;
      const kind: MirrorKind = partner.company === p.company ? "interno" : "intragrupo";
      out.set(p.id, kind);
      out.set(partner.id, kind);
    }
  }
  return out;
}
