"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useSearchParams } from "next/navigation";

import { RequestLineButton } from "@/components/grifo/company/request-line";
import { cn } from "@/lib/core/utils";
import { LATEST_MONTH } from "@/lib/features/portfolio/calendar";
import { fetchCompanyFile, portfolioKeys } from "@/lib/features/portfolio/queries";
import { DEMO_EMPRESA_ID } from "@/components/grifo/view-mode";

/**
 * El acto del producto, al alcance desde cualquier punto del scroll de la vista
 * de empresa (PRODUCT §2: la empresa decide si pide). Lee la empresa y el mes de
 * la URL y comparte clave de caché con la página, así que en la práctica no
 * dispara una segunda petición: si la ficha ya está hidratada, la reutiliza.
 *
 * Solo existe en `/empresa`. En el resto del panel no hay una empresa «propia»
 * de la que hablar, y un botón de pedir sobre la cartera del partner diría
 * justo lo contrario de lo que el producto promete.
 */
export function SidebarRequestLine({ className }: { className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = pathname === "/empresa";
  const companyId = searchParams.get("empresa") || DEMO_EMPRESA_ID;
  const month = searchParams.get("mes") || LATEST_MONTH;

  const { data } = useQuery({
    queryKey: portfolioKeys.company(companyId, month),
    queryFn: () => fetchCompanyFile(companyId, month),
    enabled: active,
    staleTime: 60 * 60 * 1000,
  });

  if (!active || !data?.latest.decision.eligible) return null;

  return (
    <div className={cn("px-2 pb-2", className)}>
      <RequestLineButton file={data} label="Pedir circulante" />
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed text-pretty">
        El partner verá tu score y tu límite. No verá movimientos ni facturas.
      </p>
    </div>
  );
}
