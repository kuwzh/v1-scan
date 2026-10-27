import type { Plateforme } from "../contracts/extracted";
import type { LienAnalyse } from "./types";

/**
 * Site de petites annonces visé par un lien, quand c'est un lien officiel de ce site : on sait
 * alors que l'utilisateur a collé une annonce (et pas un lien reçu d'un tiers). Sert à dire que
 * la lecture d'annonce par lien n'est pas encore disponible, sans confondre avec un lien suspect.
 *
 * Un faux lien qui imite Vinted n'est pas officiel : il reste traité comme suspect.
 */
export type PlateformeAnnonce = Exclude<Plateforme, "autre">;

export function plateformeDeLien(lien: LienAnalyse): PlateformeAnnonce | null {
  if (lien.verdict === "officiel") {
    if (lien.marque?.id === "vinted") return "vinted";
    if (lien.marque?.id === "leboncoin") return "leboncoin";
  }
  // Facebook n'est pas une marque surveillée : on reconnaît ses annonces à l'adresse.
  if (
    lien.domaine === "facebook.com" &&
    lien.verdict !== "suspect" &&
    /\/marketplace(?:\/|$|\?)/i.test(lien.adresse ?? "")
  ) {
    return "facebook_marketplace";
  }
  return null;
}
