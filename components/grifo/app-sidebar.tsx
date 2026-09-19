"use client";

import {
  ArrowLeftRight,
  Bell,
  Building2,
  CirclePlay,
  FlaskConical,
  Layers,
  Network,
  Orbit,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { EmbatMark } from "@/components/grifo/embat-mark";
import { readViewMode, type ViewMode } from "@/components/grifo/view-mode";
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

type NavItem = { label: string; href: string; icon: LucideIcon; hint: string };

/**
 * Una sección por actor de PRODUCT §3, etiquetada con la vista a la que
 * pertenece: el partner y el CFO de grupo trabajan la cartera; la empresa
 * mira solo su propio score. Cada entrada es una página con su URL, y el mes
 * que se está mirando viaja con ella.
 */
const SECTIONS: { label: string; view: ViewMode; items: NavItem[] }[] = [
  {
    label: "Cartera",
    view: "partner",
    items: [
      {
        label: "Empresas",
        href: "/cartera",
        icon: Layers,
        hint: "Quién está sano, quién se tuerce",
      },
      { label: "Grupos", href: "/grupos", icon: Network, hint: "Aval, contagio y techo" },
      { label: "Alertas", href: "/alertas", icon: Bell, hint: "Deterioro y mejora, fechados" },
      {
        label: "Pares",
        href: "/pares",
        icon: Orbit,
        hint: "Empresas parecidas y sus trayectorias",
      },
    ],
  },
  {
    label: "Empresa",
    view: "empresa",
    items: [
      {
        label: "Mi score",
        href: "/empresa",
        icon: Building2,
        hint: "Lo que ve la empresa antes de pedir",
      },
    ],
  },
  {
    label: "Modelo",
    view: "partner",
    items: [
      {
        label: "Backtest",
        href: "/backtest",
        icon: FlaskConical,
        hint: "Cuánto antes avisó el motor",
      },
    ],
  },
];

function hrefWithMonth(href: string, month: string | null): string {
  return month ? `${href}?mes=${month}` : href;
}

function NavMenu({
  items,
  month,
  pathname,
}: {
  items: NavItem[];
  month: string | null;
  pathname: string | null;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`) === true;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.hint}
              render={
                <Link
                  href={hrefWithMonth(item.href, month)}
                  aria-current={active ? "page" : undefined}
                />
              }
            >
              <item.icon aria-hidden className="size-4" />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function LiveNav({ sections }: { sections: typeof SECTIONS }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("mes");
  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavMenu items={section.items} month={month} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function StaticNav({ sections }: { sections: typeof SECTIONS }) {
  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavMenu items={section.items} month={null} pathname={null} />
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

export function AppSidebar() {
  // Arranca en "partner" (el comportamiento de siempre) y se corrige en cuanto
  // el efecto lee sessionStorage — sincroniza con un sistema externo real, el
  // caso que AGENTS.md sí permite para useEffect.
  const [view, setView] = useState<ViewMode>("partner");
  useEffect(() => {
    setView(readViewMode());
  }, []);
  const sections = SECTIONS.filter((section) => section.view === view);

  return (
    <Sidebar collapsible="offcanvas" className="border-r">
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/cartera" className="flex items-center gap-2.5 rounded-md">
          <EmbatMark size={28} />
          <span className="text-sm font-semibold leading-tight">Embat Flow</span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Solo el menú lee la URL, y por eso solo él necesita el límite de
            Suspense que exige useSearchParams. Envolver la barra entera
            retrasaría su hidratación hasta después de que el proveedor
            detecte el móvil, y servidor y cliente renderizarían variantes
            distintas (rail vs. panel deslizante). */}
        <Suspense fallback={<StaticNav sections={sections} />}>
          <LiveNav sections={sections} />
        </Suspense>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Cambiar entre vista de empresa y de partner" render={<Link href="/vista" />}>
              <ArrowLeftRight aria-hidden className="size-4" />
              <span>Cambiar de vista</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="La introducción, otra vez" render={<Link href="/intro" />}>
              <CirclePlay aria-hidden className="size-4" />
              <span>Qué es Embat Flow</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="text-muted-foreground px-2 py-1 text-xs leading-relaxed">
          Datos de demostración sobre metadatos reales del dataset. Parámetros{" "}
          <span className="font-mono">v1</span>.
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
