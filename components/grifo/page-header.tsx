import { Fragment, type ReactNode } from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

export type Crumb = { label: string; href?: string };

/**
 * Barra superior fija: dónde estoy a la izquierda, qué puedo hacer a la derecha.
 * Opaca a propósito — la tabla pasa por debajo al hacer scroll y un fondo
 * translúcido convertiría las cabeceras en un borrón.
 */
export function PageHeader({ crumbs, actions }: { crumbs: Crumb[]; actions?: ReactNode }) {
  return (
    <header className="bg-background sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 md:px-6">
      <SidebarTrigger className="md:hidden" />

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                <BreadcrumbItem className="min-w-0">
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
