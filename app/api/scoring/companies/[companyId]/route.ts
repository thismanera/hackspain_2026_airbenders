import { companyHistory } from "@/lib/features/scoring/api";
export async function GET(request: Request, props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  return companyHistory(request, companyId);
}
