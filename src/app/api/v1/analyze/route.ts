import { dependancesParDefaut, traiterAnalyse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Appel IA (20 s au plus par défaut) + marge. */
export const maxDuration = 30;

export function POST(request: Request): Promise<Response> {
  return traiterAnalyse(request, dependancesParDefaut());
}
