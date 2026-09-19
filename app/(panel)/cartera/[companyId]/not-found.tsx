import { ArrowLeft, FileQuestion } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function CompanyNotFound() {
  return (
    <main className="p-4 md:p-6">
      <Empty className="bg-card rounded-lg border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Esa empresa no está en la cartera</EmptyTitle>
          <EmptyDescription>
            El identificador no corresponde a ninguna empresa valorada. Comprueba que esté bien
            escrito, con el formato <span className="font-mono">COMP_0000</span>.
          </EmptyDescription>
        </EmptyHeader>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/cartera" />}>
          <ArrowLeft aria-hidden className="size-4" />
          Volver a la cartera
        </Button>
      </Empty>
    </main>
  );
}
