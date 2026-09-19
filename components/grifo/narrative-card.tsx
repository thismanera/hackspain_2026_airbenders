"use client";

import { ChevronDown } from "lucide-react";
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
    <p className="text-muted-foreground text-xs text-pretty" aria-label="Datos citados">
      Según{" "}
      {unique.map((citation, index) => {
        const label = citation.label.charAt(0).toLowerCase() + citation.label.slice(1);
        return (
          <span key={citation.ref}>
            {index > 0 ? (index === unique.length - 1 ? " y " : ", ") : null}
            {label}
            {/^[A-Z]\d/.test(citation.ref) ? <span className="font-mono"> ({citation.ref})</span> : null}
          </span>
        );
      })}
      .
    </p>
  );
}

/**
 * La lectura en llano de la ficha. Va antes que cualquier tabla porque es lo
 * que se dice en el comité; cada frase lleva debajo qué dato la sostiene.
 */
export function NarrativeCard({
  title,
  narrative,
  question,
  className,
}: {
  title?: string;
  narrative: Narrative;
  /** Pregunta contextual opcional, con su respuesta ya preparada. */
  question?: { label: string; answer: Narrative };
  className?: string;
}) {
  const [asked, setAsked] = useState(false);

  return (
    <section aria-label={title ?? "Lectura"} className={cn("flex flex-col gap-3", className)}>
      {title ? <h3 className="text-sm font-medium">{title}</h3> : null}
      <p className="text-base leading-relaxed font-medium text-pretty">{narrative.headline}</p>
      {narrative.sentences.length > 0 ? (
        <p className="text-muted-foreground max-w-[70ch] text-sm leading-relaxed text-pretty">
          {narrative.sentences.map((sentence) => sentence.text).join(" ")}
        </p>
      ) : null}

      <Citations narrative={narrative} />

      {question ? (
        <div className="flex flex-col gap-3">
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
    </section>
  );
}
