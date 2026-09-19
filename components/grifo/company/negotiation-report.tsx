"use client";

import { Check, Download, FileText, Printer, Sparkles, TrendingDown } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { formatApr, formatEuros, formatPercent, formatScore } from "@/lib/features/portfolio/format";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

export function NegotiationReport({ file }: { file: CompanyFileResponse }) {
  const { latest, company } = file;
  const { decision } = latest;

  const activeApr = decision.eligible ? decision.apr : 0.07;
  const traditionalApr = 0.082; // 8,2% TAE media bancaria de pólizas circulante mid-market
  const diffApr = Math.max(0, traditionalApr - activeApr);

  const baseVolume = decision.eligible && decision.limit > 0 ? decision.limit : 25000;
  const traditionalInterest = Math.round(baseVolume * traditionalApr);
  const embatInterest = Math.round(baseVolume * activeApr);
  const openingFee = Math.round(baseVolume * 0.006); // 0,6% apertura bancaria habitual
  const totalTraditional = traditionalInterest + openingFee;
  const totalEmbat = embatInterest;
  const annualSavings = Math.max(400, totalTraditional - totalEmbat);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <Panel
      title="Informe de negociación bancaria"
      description="Convierte tu score en dinero: argumentos y comparativa de costes para negociar con tu banco."
      aside={
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer aria-hidden className="size-3.5" />
          Imprimir dossier
        </Button>
      }
    >
      {/* Declaración Ejecutiva */}
      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-status-healthy-surface text-status-healthy-fg">
            <TrendingDown className="size-5" />
          </span>
          <div className="space-y-1 text-pretty">
            <p className="text-sm font-semibold text-foreground">
              Sobrecoste bancario estimado: hasta {formatEuros(annualSavings)} / año
            </p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Con tu score de <span className="font-semibold text-foreground">{formatScore(latest.score)} puntos</span> (Banda {decision.band}), tu financiación de circulante debería situarse en un <span className="font-medium text-foreground">{formatApr(activeApr)} TAE</span>. Si tu entidad tradicional aplica las condiciones estándar de mercado ({formatPercent(traditionalApr, 1)} TAE más comisión de apertura), estás asumiendo un sobreprecio injustificado para tu perfil de riesgo.
            </p>
          </div>
        </div>
      </div>

      {/* Matriz Comparativa Lado a Lado */}
      <div className="mt-4 overflow-hidden rounded-lg border text-xs">
        <table className="w-full text-left">
          <thead className="bg-muted/40 text-muted-foreground border-b">
            <tr>
              <th className="py-2.5 px-3.5 font-medium">Concepto</th>
              <th className="py-2.5 px-3.5 font-medium">Banca tradicional</th>
              <th className="py-2.5 px-3.5 font-medium text-foreground font-semibold">Embat Flow (preaprobado)</th>
              <th className="py-2.5 px-3.5 font-medium text-status-healthy-fg text-right">Ahorro neto</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="py-2.5 px-3.5 font-medium">Tipo de interés (TAE)</td>
              <td className="py-2.5 px-3.5 tabular-nums text-muted-foreground">8,2 % TAE (media mercado)</td>
              <td className="py-2.5 px-3.5 tabular-nums font-semibold text-foreground">{formatApr(activeApr)} TAE</td>
              <td className="py-2.5 px-3.5 tabular-nums text-right font-medium text-status-healthy-fg">
                -{(diffApr * 100).toFixed(1).replace(".", ",")} %
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3.5 font-medium">Comisión de apertura y estudio</td>
              <td className="py-2.5 px-3.5 tabular-nums text-muted-foreground">0,60 % ({formatEuros(openingFee)})</td>
              <td className="py-2.5 px-3.5 font-semibold text-foreground">0,00 % (0 €)</td>
              <td className="py-2.5 px-3.5 tabular-nums text-right font-medium text-status-healthy-fg">
                +{formatEuros(openingFee)}
              </td>
            </tr>
            <tr>
              <td className="py-2.5 px-3.5 font-medium">Comisión por no disponibilidad</td>
              <td className="py-2.5 px-3.5 text-muted-foreground">0,25 % trimestral</td>
              <td className="py-2.5 px-3.5 font-semibold text-foreground">0,00 %</td>
              <td className="py-2.5 px-3.5 text-right font-medium text-status-healthy-fg">Sin comisiones</td>
            </tr>
            <tr>
              <td className="py-2.5 px-3.5 font-medium">Garantías exigidas</td>
              <td className="py-2.5 px-3.5 text-muted-foreground">Aval personal / cruzado habitual</td>
              <td className="py-2.5 px-3.5 font-semibold text-foreground">Basado en flujos de caja reales</td>
              <td className="py-2.5 px-3.5 text-right font-medium text-status-healthy-fg">Sin aval personal</td>
            </tr>
            <tr className="bg-muted/10 font-semibold">
              <td className="py-3 px-3.5 text-foreground">Coste total anual estimado</td>
              <td className="py-3 px-3.5 tabular-nums text-muted-foreground">{formatEuros(totalTraditional)}</td>
              <td className="py-3 px-3.5 tabular-nums text-foreground">{formatEuros(totalEmbat)}</td>
              <td className="py-3 px-3.5 tabular-nums text-right text-sm text-status-healthy-fg">
                {formatEuros(annualSavings)} / año
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Argumentario para Negociar con el Banco */}
      <div className="mt-4 rounded-xl border bg-card p-4">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FileText className="size-3.5" />
          Argumentario certificado para tu comisión bancaria
        </h4>
        <ul className="mt-3 space-y-2 text-xs text-pretty text-muted-foreground">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-status-healthy-fg" />
            <span>
              <strong className="text-foreground">Salud financiera contrastada:</strong> Nuestra empresa registra una puntuación de {formatScore(latest.score)} sobre 100 evaluada sobre datos transaccionales objetivos de los últimos meses.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-status-healthy-fg" />
            <span>
              <strong className="text-foreground">Línea alternativa disponible:</strong> Disponemos de una propuesta preaprobada de circulante por {formatEuros(decision.limit)} a {formatApr(activeApr)} TAE sin exigencia de aval de socios.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-status-healthy-fg" />
            <span>
              <strong className="text-foreground">Objetivo de negociación:</strong> Equiparar el tipo de interés del circulante al {formatApr(activeApr)} TAE y eliminar la comisión de apertura en la próxima renovación.
            </span>
          </li>
        </ul>
      </div>
    </Panel>
  );
}
