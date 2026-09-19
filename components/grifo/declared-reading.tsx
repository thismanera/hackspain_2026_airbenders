"use client";

import { TellMeMark } from "@/components/grifo/tellme-mark";
import { cn } from "@/lib/core/utils";
import { useReading } from "@/lib/features/portfolio/hooks";
import type { Narrative } from "@/lib/features/portfolio/narrative";
import type { ReadingKind, ReadingSource } from "@/lib/features/portfolio/reading";

/**
 * La caja de la lectura, idéntica en empresa y en grupo. Es el único panel
 * oscuro de la aplicación, y a propósito: lleva el mark y el barrido del logo
 * de TellMe, así que la inversión marca de un vistazo que ese texto está
 * redactado (por el analista o por plantilla) y no calculado. No es un estado del score.
 *
 * Quién lo redactó y que no decide quedan en el texto solo para lector de
 * pantalla: son declaraciones que deben existir, pero el analista ya lo sabe
 * por la caja, y repetírselo en cada ficha es ruido.
 */
export function ReadingBox({
  headline,
  source,
  className,
}: {
  headline: string;
  source: ReadingSource;
  className?: string;
}) {
  return (
    <section
      aria-label="Lectura de inteligencia artificial"
      className={cn(
        "ai-panel border-ai-border bg-ai-surface rounded-xl border px-4 py-3.5",
        className,
      )}
    >
      <p className="text-ai-accent mb-2.5 flex items-center gap-2 text-sm font-medium">
        {/* 32 px: es la firma de la caja, no un adorno al lado del titular. */}
        <TellMeMark size={64} className="size-8" />
        {/* El degradado va en su propio span: `color: transparent` sobre el
            párrafo dejaría invisible el mark, que no pinta con currentColor. */}
        <span className="ai-label text-base">TellMe</span>
        <span className="sr-only">
          {source === "analista"
            ? ", redactada por el analista a partir de la cascada"
            : ", redactada con plantilla"}
          , no decide
        </span>
      </p>
      <p className="text-ai-fg text-base leading-snug font-medium text-pretty">{headline}</p>
    </section>
  );
}

/**
 * Una sola frase, en su propia caja y por encima de la evidencia. La lectura
 * viene materializada del run (analista o plantilla); nunca decide.
 */
export function DeclaredReading({
  kind,
  companyId,
  month,
  fallback,
  className,
}: {
  kind: ReadingKind;
  companyId: string;
  month: string;
  fallback: Narrative;
  className?: string;
}) {
  const { data } = useReading(companyId, month, kind);

  return (
    <ReadingBox
      headline={(data ?? fallback).headline}
      source={data?.source ?? "plantilla"}
      className={className}
    />
  );
}
