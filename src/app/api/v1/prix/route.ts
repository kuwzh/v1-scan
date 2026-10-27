import { dependancesParDefaut, traiterPrix } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Recherche web (50 s au plus par défaut, reprises comprises) + marge. */
export const maxDuration = 60;

export function POST(request: Request): Promise<Response> {
  return traiterPrix(request, dependancesParDefaut());
}
