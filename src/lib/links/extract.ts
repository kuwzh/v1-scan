import { analyserHote } from "./domain";
import { refanger, retirerInvisibles } from "./normalize";

const AVEC_SCHEMA = String.raw`(?:https?|hxxps?):\/\/[^\s<>"'«»]+`;
const SANS_SCHEMA = String.raw`(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:[/?#][^\s<>"'«»]*)?`;
const MOTIF = new RegExp(`(?:${AVEC_SCHEMA})|(?:${SANS_SCHEMA})`, "gi");
const PONCTUATION_FINALE = /[.,;:!?)\]}»"'’]+$/;

/**
 * Repère les adresses dans un texte (conversation collée, description) : liens complets
 * et adresses « nues » comme `vinted-paiement.com`, que les messages d'arnaque écrivent
 * souvent sans `https://`.
 *
 * Les adresses e-mail, les noms de fichiers (`photo.jpg`) et les mots dont la terminaison
 * n'existe pas dans la Public Suffix List sont ignorés. Les chaînes renvoyées ne sont
 * pas modifiées (hors liens « défangués » `[.]`) : on les passe ensuite à `analyserLien`.
 */
export function extraireLiens(texte: string, max = 20): string[] {
  const propre = refanger(retirerInvisibles(texte).normalize("NFKC"));
  const trouves: string[] = [];
  const vus = new Set<string>();

  for (const m of propre.matchAll(MOTIF)) {
    const debut = m.index ?? 0;
    const precedent = propre.charAt(debut - 1);
    // Adresse e-mail : on écarte le domaine (après le @) comme la partie locale (avant),
    // car des noms comme « jean.dupont » ont une terminaison qui existe (.dupont).
    if (precedent === "@" || propre.charAt(debut + m[0].length) === "@") continue;
    const candidat = m[0].replace(PONCTUATION_FINALE, "");
    if (candidat === "") continue;

    if (!/^(?:https?|hxxps?):\/\//i.test(candidat)) {
      const hote = (candidat.split(/[/?#]/, 1)[0] ?? "").replace(/:\d+$/, "");
      if (!analyserHote(hote).suffixeConnu) continue;
    }

    const cle = candidat.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    trouves.push(candidat);
    if (trouves.length >= max) break;
  }
  return trouves;
}
