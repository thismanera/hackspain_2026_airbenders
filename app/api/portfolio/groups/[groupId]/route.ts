import { z } from "zod";

import { getGroupFileLive } from "@/lib/features/portfolio/live";
import { getGroupFile } from "@/lib/features/portfolio/source";

const querySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
): Promise<Response> {
  const { groupId } = await params;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const file =
    (await getGroupFileLive(groupId, parsed.data.month)) ??
    getGroupFile(groupId, parsed.data.month);
  if (!file) {
    return Response.json({ error: "Grupo no encontrado" }, { status: 404 });
  }

  return Response.json(file);
}
