import { analyserHote } from "./domain";
import { refanger, retirerInvisibles } from "./normalize";

const AVEC_SCHEMA = String.raw`(?:https?|hxxps?):\/\/[^\s<>"'«»]+`;
// Lettres de tout alphabet : un nom comme « vіnted.fr » (і cyrillique) doit être extrait en
// entier, pas amputé de sa première lettre.
const LETTRE_OU_CHIFFRE = String.raw`[\p{L}\p{N}]`;
const SANS_SCHEMA = String.raw`(?:${LETTRE_OU_CHIFFRE}(?:[\p{L}\p{N}-]{0,61}${LETTRE_OU_CHIFFRE})?\.)+\p{L}{2,24}(?::\d{2,5})?(?:[/?#][^\s<>"'«»]*)?`;
const MOTIF = new RegExp(`(?:${AVEC_SCHEMA})|(?:${SANS_SCHEMA})`, "giu");
const PONCTUATION_FINALE = /[.,;:!?)\]}»"'’]+$/;

/** Hôte en ASCII (punycode) pour interroger la Public Suffix List ; inchangé s'il est invalide. */
function enAscii(hote: string): string {
  try {
    return new URL(`http://${hote}`).hostname;
  } catch {
    return hote;
  }
}

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
      if (!analyserHote(enAscii(hote)).suffixeConnu) continue;
    }

    const cle = candidat.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    trouves.push(candidat);
    if (trouves.length >= max) break;
  }
  return trouves;
}
