import { dependancesParDefaut, traiterAnalyse } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Appel IA (30 s au plus par défaut : la transcription exhaustive d'une longue conversation est lente) + marge. */
export const maxDuration = 45;

export function POST(request: Request): Promise<Response> {
  return traiterAnalyse(request, dependancesParDefaut());
}
