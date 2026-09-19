"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export const INTRO_SEEN_KEY = "embat-flow-intro";

/** La primera visita de la pestaña empieza por la introducción; después ya no molesta. */
export function IntroGate() {
  const router = useRouter();
  useEffect(() => {
    if (window.sessionStorage.getItem(INTRO_SEEN_KEY) === null) {
      router.replace("/intro");
    }
  }, [router]);
  return null;
}
