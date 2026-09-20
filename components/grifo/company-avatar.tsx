import { Building2 } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/core/utils";

/** Los seis fondos de public/avatars, en el orden en que se reparten por empresa. */
const AVATAR_COLORS = ["indigo", "sky", "emerald", "rose", "blue-light", "green-dark"] as const;

/** Hash estable del id: la misma empresa siempre cae en el mismo color, sin estado ni catálogo. */
function colorFor(companyId: string): (typeof AVATAR_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < companyId.length; i++) {
    hash = (hash * 31 + companyId.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/** Icono de color por empresa: distingue de un vistazo filas y cabeceras que si no son solo texto mono. */
export function CompanyAvatar({
  companyId,
  size = "default",
  className,
}: {
  companyId: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={cn("bg-muted", className)}>
      <AvatarImage src={`/avatars/${colorFor(companyId)}.jpg`} alt="" />
      <AvatarFallback>
        <Building2 aria-hidden className="size-4" />
      </AvatarFallback>
    </Avatar>
  );
}
