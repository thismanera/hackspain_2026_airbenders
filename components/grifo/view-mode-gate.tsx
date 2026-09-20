"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { isPartnerRoute, useViewMode } from "@/components/grifo/view-mode";

/**
 * Última línea: si esta pestaña entró como empresa, ninguna ruta del partner se
 * llega a ver. Los enlaces hacia la cartera ya están quitados de la vista de
 * empresa, pero quedan caminos que no pasan por un enlace nuestro —`/` redirige
 * a `/cartera` en servidor, el botón atrás, una URL pegada— y todos acababan
 * enseñando la cartera entera a quien había entrado como una sola empresa.
 *
 * Solo corta en esa dirección. Un partner que abra `/empresa` está mirando lo
 * que ve su cliente, que es una lectura legítima de la demo.
 */
export function ViewModeGate() {
  const router = useRouter();
  const pathname = usePathname();
  const view = useViewMode();

  useEffect(() => {
    if (view !== "empresa") return;
    if (!isPartnerRoute(pathname)) return;
    router.replace("/empresa");
  }, [router, pathname, view]);

  return null;
}
