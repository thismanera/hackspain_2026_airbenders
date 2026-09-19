"use client";

import { ChevronDown, MessageSquareText } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import type { Narrative } from "@/lib/features/portfolio/narrative";

function Citations({ narrative }: { narrative: Narrative }) {
  const seen = new Set<string>();
  const unique = narrative.sentences
    .flatMap((sentence) => sentence.citations)
    .filter((citation) => {
      if (seen.has(citation.ref)) return false;
      seen.add(citation.ref);
      return true;
    });
  if (unique.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Datos citados">
      {unique.map((citation) => (
        <li
          key={citation.ref}
          className="text-muted-foreground bg-background inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
        >
          <span className="font-mono">{citation.ref.replace("puerta:", "")}</span>
          <span className="text-foreground/70">{citation.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * La lectura en llano de la ficha. Va antes que cualquier tabla porque es lo
 * que se dice en el comité; cada frase lleva debajo qué dato la sostiene, para
 * que el lector pueda ir a comprobarlo. Y la nota al pie lo deja escrito: el
 * texto explica lo calculado, no calcula nada.
 */
export function NarrativeCard({
  title,
  narrative,
  question,
  className,
}: {
  title: string;
  narrative: Narrative;
  /** Pregunta contextual opcional, con su respuesta ya preparada. */
  question?: { label: string; answer: Narrative };
  className?: string;
}) {
  const [asked, setAsked] = useState(false);

  return (
    <section
      aria-label={title}
      className={cn("bg-secondary/60 flex flex-col gap-3 rounded-xl border p-4", className)}
    >
      <div className="flex items-start gap-2.5">
        <MessageSquareText aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">{title}</h3>
          <p className="text-base leading-relaxed font-medium text-pretty">{narrative.headline}</p>
          {narrative.sentences.length > 0 ? (
            <p className="text-muted-foreground max-w-[70ch] text-sm leading-relaxed text-pretty">
              {narrative.sentences.map((sentence) => sentence.text).join(" ")}
            </p>
          ) : null}
        </div>
      </div>

      <Citations narrative={narrative} />

      {question ? (
        <div className="flex flex-col gap-3 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            aria-expanded={asked}
            onClick={() => setAsked((open) => !open)}
          >
            {question.label}
            <ChevronDown
              aria-hidden
              className={cn("transition-transform duration-150", asked && "rotate-180")}
            />
          </Button>
          {asked ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium text-pretty">{question.answer.headline}</p>
              {question.answer.sentences.map((sentence, index) => (
                <p
                  key={index}
                  className="text-muted-foreground max-w-[70ch] leading-relaxed text-pretty"
                >
                  {sentence.text}
                </p>
              ))}
              <Citations narrative={question.answer} />
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Lectura generada a partir de la decisión ya calculada. El texto explica; no calcula.
      </p>
    </section>
  );
}
