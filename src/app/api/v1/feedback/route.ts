import { dependancesParDefaut, traiterFeedback } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return traiterFeedback(request, dependancesParDefaut());
}
