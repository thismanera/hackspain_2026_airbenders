import { runDetail } from "@/lib/features/scoring/api";
export async function GET(_request: Request, props: { params: Promise<{ runId: string }> }) {
  const { runId } = await props.params;
  return runDetail(runId);
}
