import Image from "next/image";

import { cn } from "@/lib/core/utils";

/**
 * El átomo de TellMe. En la caja oscura de la lectura el PNG llega con fondo
 * blanco: `screen` lo funde con el índigo y deja solo el barrido del trazo.
 */
export function TellMeMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/tellmeonlylogo.png"
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 mix-blend-screen", className)}
    />
  );
}
