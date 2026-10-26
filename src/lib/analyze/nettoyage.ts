import { contientFormulationInterdite } from "../copy/wording";
import { normaliserTexte } from "../rules/texte";

const LONGUEUR_MAX_LIBELLE = 160;
const LONGUEUR_MAX_CONSEIL = 220;
const LONGUEUR_MIN = 8;

const MOTS_VIDES = new Set([
  "les",
  "des",
  "une",
  "pour",
  "dans",
  "que",
  "qui",
  "est",
  "sur",
  "pas",
  "avec",
  "vous",
  "ton",
  "tes",
  "votre",
  "vos",
  "aux",
  "cette",
  "ces",
  "son",
  "ses",
  "par",
  "plus",
  "ete",
  "etre",
  "ont",
  "elle",
  "leur",
  "mais",
  "tout",
  "tous",
  "sans",
]);

/**
 * Nettoie un texte renvoyé par l'IA avant de l'afficher : espaces, puces, guillemets,
 * longueur. Renvoie `null` si le texte est vide, trop court ou contient une formulation
 * accusatoire (le texte est alors écarté, pas réécrit).
 */
export function nettoyerTexteIa(brut: string, longueurMax: number): string | null {
  let texte = brut
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–—•*·\d.)\s]+(?=[\p{L}«"“])/u, "")
    .replace(/^["«“]\s*|\s*["»”]$/g, "")
    .trim();
  if (texte.length < LONGUEUR_MIN) return null;
  if (contientFormulationInterdite(texte)) return null;
  if (texte.length > longueurMax) {
    const coupe = texte.slice(0, longueurMax - 1);
    const dernierEspace = coupe.lastIndexOf(" ");
    texte = `${(dernierEspace > longueurMax * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trimEnd()}…`;
  }
  return texte;
}

export const nettoyerLibelleIa = (brut: string) => nettoyerTexteIa(brut, LONGUEUR_MAX_LIBELLE);
export const nettoyerConseilIa = (brut: string) => nettoyerTexteIa(brut, LONGUEUR_MAX_CONSEIL);

function motsSignificatifs(texte: string): Set<string> {
  return new Set(
    normaliserTexte(texte)
      .split(/[^a-z0-9]+/)
      .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m)),
  );
}

/**
 * Deux libellés disent-ils la même chose ? Recouvrement de leurs mots significatifs :
 * au moins deux mots communs et la moitié du plus court. Sert à ne pas afficher deux fois
 * « on te propose WhatsApp » (une fois par une règle, une fois par l'IA).
 */
export function memeIdee(a: string, b: string): boolean {
  const ma = motsSignificatifs(a);
  const mb = motsSignificatifs(b);
  if (ma.size === 0 || mb.size === 0) return false;
  let communs = 0;
  for (const m of ma) if (mb.has(m)) communs++;
  return communs >= 2 && communs / Math.min(ma.size, mb.size) >= 0.5;
}

/** Garde `candidats` qui ne répètent ni `existants` ni un candidat précédent. */
export function sansDoublons(candidats: readonly string[], existants: readonly string[]): string[] {
  const gardes: string[] = [];
  for (const c of candidats) {
    const vus = [...existants, ...gardes];
    if (vus.some((v) => normaliserTexte(v) === normaliserTexte(c) || memeIdee(v, c))) continue;
    gardes.push(c);
  }
  return gardes;
}
