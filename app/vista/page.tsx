import type { Metadata } from "next";

import { VistaClient } from "@/components/grifo/vista/vista-client";

export const metadata: Metadata = { title: "Elige tu vista" };

export default function VistaPage() {
  return <VistaClient />;
}
