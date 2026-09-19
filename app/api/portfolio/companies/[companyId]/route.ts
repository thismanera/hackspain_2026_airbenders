import { z } from "zod";

import { getCompanyFile } from "@/lib/features/portfolio/source";
import { getCompanyFileLive } from "@/lib/features/portfolio/live";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> },
): Promise<Response> {
  const { companyId } = await params;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const file =
    (await getCompanyFileLive(companyId, parsed.data.month)) ??
    getCompanyFile(companyId, parsed.data.month);
  if (!file) {
    return Response.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  return Response.json(file);
}
