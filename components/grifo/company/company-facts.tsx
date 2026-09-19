import { cn } from "@/lib/core/utils";
import { formatPercent, formatScore, formatSigned } from "@/lib/features/portfolio/format";

/**
 * Score y confianza en una frase, no en una racha de cifras. El paréntesis
 * es el cambio a 3 meses: sin flecha, para que nadie lea "56 → 4,4".
 */
export function CompanyFacts({
  score,
  trend3m,
  confidence,
  unknown = false,
  className,
}: {
  score: number;
  trend3m: number | null;
  confidence: number;
  unknown?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex flex-wrap items-center gap-x-2 text-xs",
        className,
      )}
    >
      <span>
        Score{" "}
        <span
          className={cn("text-foreground font-medium tabular-nums", unknown && "text-muted-foreground")}
        >
          {formatScore(score)}
        </span>{" "}
        de 100
        {trend3m !== null ? (
          <span>
            {" "}
            ({formatSigned(trend3m)} en 3 meses)
          </span>
        ) : null}
      </span>
      <span aria-hidden>·</span>
      <span>
        Confianza{" "}
        <span className="text-foreground font-medium tabular-nums">
          {formatPercent(confidence, 0)}
        </span>
      </span>
    </span>
  );
}
