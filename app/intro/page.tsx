import { Suspense } from "react";

import { IntroClient } from "@/components/grifo/intro/intro-client";

export default function IntroPage() {
  return (
    <Suspense>
      <IntroClient />
    </Suspense>
  );
}
