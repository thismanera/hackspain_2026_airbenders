"use client";

import { Building2, Landmark, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { EmbatMark } from "@/components/grifo/embat-mark";
import { DEMO_EMPRESA_ID, writeViewMode, type ViewMode } from "@/components/grifo/view-mode";

function ViewOption({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-card hover:bg-status-none-surface focus-visible:ring-ring flex flex-col items-center gap-4 rounded-[14px] border px-8 py-10 text-center transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span className="bg-muted flex size-14 items-center justify-center rounded-lg">
        <Icon aria-hidden className="size-6" />
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="text-base font-semibold tracking-[-0.01em]">{title}</span>
        <span className="text-muted-foreground text-sm text-balance">{description}</span>
      </span>
    </button>
  );
}

export function VistaClient() {
  const router = useRouter();

  function choose(mode: ViewMode) {
    // Escribir el modo antes de navegar: si el guard de rutas corriese con el
    // valor viejo, mandaría de vuelta justo a donde el usuario acaba de salir.
    writeViewMode(mode);
    router.push(mode === "empresa" ? `/empresa?empresa=${DEMO_EMPRESA_ID}` : "/cartera");
  }

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-10 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <EmbatMark size={40} />
        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          ¿Cómo quiere entrar?
        </h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Puede cambiar de vista cuando quiera desde el menú lateral.
        </p>
      </div>
      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <ViewOption
          icon={Building2}
          title="Entrar en vista de empresa"
          description="Su score, su comparativa frente a pares y su oferta preaprobada."
          onClick={() => choose("empresa")}
        />
        <ViewOption
          icon={Landmark}
          title="Entrar en vista del partner"
          description="Las empresas que han pedido financiación, con su score al día."
          onClick={() => choose("partner")}
        />
      </div>
    </div>
  );
}
