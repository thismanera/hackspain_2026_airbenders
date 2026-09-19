"use client";

import { RotateCw, Unplug } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function CarteraError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="p-4 md:p-6">
      <Empty className="bg-card rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Unplug aria-hidden />
          </EmptyMedia>
          <EmptyTitle>No hemos podido cargar la cartera</EmptyTitle>
          <EmptyDescription>
            El motor de scoring no ha respondido. Los datos no se han perdido: vuelve a intentarlo y,
            si sigue fallando, avisa al equipo con la hora exacta.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCw aria-hidden className="size-4" />
          Reintentar
        </Button>
      </Empty>
    </main>
  );
}
