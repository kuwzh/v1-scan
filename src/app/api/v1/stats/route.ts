import { dependancesParDefaut, traiterStats } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  const deps = dependancesParDefaut();
  return traiterStats(deps.lireCompteur, deps.config.cacheCompteurS);
}
