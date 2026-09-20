import { z } from "zod";

import { scoringResponse } from "@/lib/features/portfolio/http";
import { getCompanyFile } from "@/lib/features/portfolio/source";

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

  return scoringResponse(
    () => getCompanyFile(companyId, parsed.data.month),
    "Empresa no encontrada",
    request,
  );
}
