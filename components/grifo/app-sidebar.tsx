"use client";

import { AlertTriangle, CircleSlash, Layers, TrendingDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

/**
 * Las "vistas" no son secciones inventadas: cada una es la cartera con un filtro
 * distinto, el mismo estado que vive en la URL. Un enlace aquí y teclear el
 * filtro a mano llevan exactamente al mismo sitio.
 */
const VIEWS = [
  { label: "Todas las empresas", icon: Layers, estado: null, direccion: null },
  { label: "En riesgo", icon: AlertTriangle, estado: "riesgo", direccion: null },
  { label: "Con deterioro", icon: TrendingDown, estado: null, direccion: "deterioro" },
  { label: "Sin datos suficientes", icon: CircleSlash, estado: "sin_datos", direccion: null },
] as const;

type ViewFilter = { estado: string | null; direccion: string | null };

function hrefFor(view: ViewFilter, month: string | null): string {
  const params = new URLSearchParams();
  if (view.estado) params.set("estado", view.estado);
  if (view.direccion) params.set("direccion", view.direccion);
  if (month) params.set("mes", month);
  const search = params.toString();
  return search ? `/cartera?${search}` : "/cartera";
}

function ViewsMenu({ month, current }: { month: string | null; current: ViewFilter | null }) {
  return (
    <SidebarMenu>
      {VIEWS.map((view) => {
        const active =
          current !== null && current.estado === view.estado && current.direccion === view.direccion;
        return (
          <SidebarMenuItem key={view.label}>
            <SidebarMenuButton
              isActive={active}
              render={
                <Link href={hrefFor(view, month)} aria-current={active ? "page" : undefined} />
              }
            >
              <view.icon aria-hidden className="size-4" />
              <span>{view.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function LiveViewsMenu() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <ViewsMenu
      month={searchParams.get("mes")}
      current={
        pathname === "/cartera"
          ? { estado: searchParams.get("estado"), direccion: searchParams.get("direccion") }
          : null
      }
    />
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas" className="border-r">
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/cartera" className="flex items-center gap-2.5 rounded-md">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-semibold"
          >
            G
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Grifo</span>
            <span className="text-muted-foreground text-xs">Decisión de crédito</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Cartera</SidebarGroupLabel>
          <SidebarGroupContent>
            {/* Solo el menú lee la URL, y por eso solo él necesita el límite de
                Suspense que exige useSearchParams. Envolver la barra entera
                retrasaría su hidratación hasta después de que el proveedor
                detecte el móvil, y servidor y cliente renderizarían variantes
                distintas (rail vs. panel deslizante). */}
            <Suspense fallback={<ViewsMenu month={null} current={null} />}>
              <LiveViewsMenu />
            </Suspense>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <p className="text-muted-foreground px-2 py-1 text-xs leading-relaxed">
          Datos de demostración sobre metadatos reales del dataset. Parámetros{" "}
          <span className="font-mono">v1</span>.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
