import type { Metadata } from "next";
import { Suspense } from "react";

import { IntroClient } from "@/components/grifo/intro/intro-client";

export const metadata: Metadata = { title: "Qué es Embat Flow" };

export default function IntroPage() {
  return (
    <Suspense>
      <IntroClient />
    </Suspense>
  );
}
