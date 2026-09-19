import { exportScores } from "@/lib/features/scoring/api";
export async function GET(request: Request) {
  return exportScores(request);
}
