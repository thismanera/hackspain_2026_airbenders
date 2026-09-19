"use client";

import {
  Bell,
  Building2,
  CirclePlay,
  FlaskConical,
  Layers,
  Network,
  Scale,
  type LucideIcon,
} from "lucide-react";
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

type NavItem = { label: string; href: string; icon: LucideIcon; hint: string };

/**
 * Una sección por actor de PRODUCT §3. El partner y el CFO de grupo trabajan la
 * cartera; la empresa mira su propio score; el jurado mide el motor. Cada
 * entrada es una página con su URL, y el mes que se está mirando viaja con ella.
 */
const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Cartera",
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
        label: "Comparar",
        href: "/comparar",
        icon: Scale,
        hint: "Hasta tres empresas lado a lado",
      },
    ],
  },
  {
    label: "Empresa",
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

function LiveNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("mes");
  return (
    <>
      {SECTIONS.map((section) => (
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

function StaticNav() {
  return (
    <>
      {SECTIONS.map((section) => (
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
  return (
    <Sidebar collapsible="offcanvas" className="border-r">
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/cartera" className="flex items-center gap-2.5 rounded-md">
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-semibold"
          >
            E
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">Embat Flow</span>
            <span className="text-muted-foreground text-xs">
              Circulante que se recalcula cada mes
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Solo el menú lee la URL, y por eso solo él necesita el límite de
            Suspense que exige useSearchParams. Envolver la barra entera
            retrasaría su hidratación hasta después de que el proveedor
            detecte el móvil, y servidor y cliente renderizarían variantes
            distintas (rail vs. panel deslizante). */}
        <Suspense fallback={<StaticNav />}>
          <LiveNav />
        </Suspense>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
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
