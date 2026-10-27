import { MARQUES } from "../links/marques";
import type { PlateformeAnnonce } from "../links/plateforme";

/** Domaines officiels des sites d'annonces, repris des marques surveillées (une seule source). */
const DOMAINES: ReadonlyArray<readonly [string, PlateformeAnnonce]> = MARQUES.flatMap((marque) =>
  marque.id === "vinted" || marque.id === "leboncoin"
    ? marque.officiels.map((domaine) => [domaine, marque.id as PlateformeAnnonce] as const)
    : [],
);

/**
 * Le texte saisi dans le champ lien est-il une annonce d'un site connu (Vinted, Leboncoin,
 * Facebook Marketplace) ? Sert à prévenir tout de suite que son contenu ne sera pas lu. Le
 * serveur fait l'analyse de référence : ici, un simple contrôle sur le nom d'hôte.
 *
 * Le nom d'hôte doit être exactement le domaine ou l'un de ses sous-domaines : `vinted.fr.autre.com`
 * ou une imitation en lettres d'un autre alphabet ne correspondent pas.
 */
export function detecterLienAnnonce(saisie: string): PlateformeAnnonce | null {
  const brut = saisie.trim().split(/\s+/)[0] ?? "";
  if (brut === "") return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(brut) ? brut : `https://${brut}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const hote = url.hostname.toLowerCase().replace(/\.$/, "");
  for (const [domaine, plateforme] of DOMAINES) {
    if (hote === domaine || hote.endsWith(`.${domaine}`)) return plateforme;
  }
  if (
    (hote === "facebook.com" || hote.endsWith(".facebook.com")) &&
    /^\/marketplace(?:\/|$)/i.test(url.pathname)
  ) {
    return "facebook_marketplace";
  }
  return null;
}
