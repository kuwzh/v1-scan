import { dependancesParDefaut, traiterSante } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return traiterSante(dependancesParDefaut());
}
