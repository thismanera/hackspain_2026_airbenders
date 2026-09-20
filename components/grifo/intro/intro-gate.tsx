"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export const INTRO_SEEN_KEY = "embat-flow-intro";

export function hasSeenIntro(): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.localStorage.getItem(INTRO_SEEN_KEY) !== null ||
    window.sessionStorage.getItem(INTRO_SEEN_KEY) !== null
  );
}

export function markIntroSeen(): void {
  window.localStorage.setItem(INTRO_SEEN_KEY, "1");
  window.sessionStorage.setItem(INTRO_SEEN_KEY, "1");
}

/**
 * Solo la entrada por /cartera (la ruta por defecto del panel) puede mandar a
 * /intro. Navegar a Pares, Alertas, etc. desde el sidebar no debe devolverte
 * a la introducción aunque el layout se remonte tras un redirect de servidor.
 */
export function IntroGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hasSeenIntro()) return;
    if (pathname !== "/cartera") return;
    router.replace("/intro");
  }, [router, pathname]);

  return null;
}
