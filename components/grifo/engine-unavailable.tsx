import { RotateCw, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * No hay ninguna ejecución del motor compatible en la base de datos. Nunca se
 * rellena con datos sintéticos: el panel enseña exactamente lo que el pipeline
 * ha persistido o nada (PRODUCT §invariantes).
 */
export function EngineUnavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <Empty className="bg-card rounded-lg border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Unplug aria-hidden />
        </EmptyMedia>
        <EmptyTitle>Motor de scoring no disponible</EmptyTitle>
        <EmptyDescription>
          No hay ninguna ejecución del motor importada con el contrato actual. Lanza el pipeline (
          <code className="font-mono text-xs">pnpm db:setup</code>) y vuelve a cargar; el panel no
          enseña datos que el motor no haya calculado.
        </EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden className="size-4" />
          Reintentar
        </Button>
      ) : null}
    </Empty>
  );
}
