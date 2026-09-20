import Image from "next/image";

import { cn } from "@/lib/core/utils";

/** El icono de Embat, con el redondeo de un icono de app de iPhone. */
export function EmbatMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/embatlogo.jpg"
      alt="Embat"
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[22%]", className)}
    />
  );
}
