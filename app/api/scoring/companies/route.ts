import { listCompanies } from "@/lib/features/scoring/api";
export async function GET(request: Request) {
  return listCompanies(request);
}
