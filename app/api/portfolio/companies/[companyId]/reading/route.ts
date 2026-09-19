import { z } from "zod";

import { ask, isHelmcodeConfigured } from "@/lib/integrations/helmcode";
import { scoringResponse } from "@/lib/features/portfolio/http";
import { readingKindSchema, resolveReading } from "@/lib/features/portfolio/reading";
import { getCompanyFile } from "@/lib/features/portfolio/source";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
  kind: readingKindSchema,
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

  return scoringResponse(async () => {
    const file = await getCompanyFile(companyId, parsed.data.month);
    if (!file) return null;
    return resolveReading(
      parsed.data.kind,
      file,
      isHelmcodeConfigured()
        ? async (system, user) => {
            const result = await ask(user, system, {
              json: true,
              maxTokens: 400,
              temperature: 0.2,
              signal: AbortSignal.timeout(4000),
            });
            return JSON.parse(result.content) as unknown;
          }
        : undefined,
    );
  }, "Empresa no encontrada");
}
