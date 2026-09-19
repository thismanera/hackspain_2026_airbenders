import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";

/** La comparación vive ahora en /pares; los enlaces antiguos siguen funcionando. */
export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/pares?${query}` : "/pares");
}
