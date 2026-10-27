import type { Plateforme } from "../contracts/extracted";
import type { Niveau } from "../contracts/niveau";
import type { PrixResponse } from "../contracts/prix";
import type { AnalysisResult } from "../contracts/result";
import type { Gravite } from "../contracts/signals";
import { fr } from "../copy/fr";

/** Adresse affichée sur la carte quand `NEXT_PUBLIC_SITE_URL` est absente ou invalide. */
export const HOTE_PAR_DEFAUT = "v1-scan.vercel.app";
export const MAX_SIGNAUX_CARTE = 3;

/** Hôte du site (sans protocole ni slash final), pour le logo et l'accroche de la carte. */
export function hotePartage(brut: string | undefined): string {
  const valeur = brut?.trim();
  if (!valeur) return HOTE_PAR_DEFAUT;
  try {
    const url = new URL(valeur);
    if (url.protocol !== "https:" && url.protocol !== "http:") return HOTE_PAR_DEFAUT;
    return url.host || HOTE_PAR_DEFAUT;
  } catch {
    return HOTE_PAR_DEFAUT;
  }
}

/**
 * Tout ce que la carte affiche, et rien d'autre : le dessin ne reçoit rien de plus. Des phrases
 * fixes (jamais le texte libre de l'analyse), un score, un niveau, un écart arrondi.
 */
export interface DonneesCarte {
  score: number;
  niveau: Niveau;
  titreNiveau: string;
  /** Au plus `MAX_SIGNAUX_CARTE`, du plus grave au moins grave. Une phrase de repli si aucune. */
  signaux: Array<{ texte: string; gravite: Gravite }>;
  /** Signaux d'alerte non montrés (nombre seulement). */
  autres: number;
  rassurant: string | null;
  /** « Annonce Vinted » ; `null` si le site est inconnu. */
  site: string | null;
  /** « −65 % vs prix d'occasion habituel » ; `null` sans comparaison fiable. */
  ecartPrix: string | null;
  hote: string;
  accroche: string;
  mention: string;
}

export interface EntreeCarte {
  resultat: Pick<AnalysisResult, "score" | "niveau" | "signaux" | "rassurants"> & {
    donnees_extraites: { plateforme: Plateforme | null };
  };
  /** Site choisi par l'utilisateur : sert quand l'analyse n'a lu aucune plateforme. */
  site: Plateforme | null;
  /** Comparaison de prix, si elle a été faite. */
  prix: PrixResponse | null;
  hote: string;
}

const RANG: Readonly<Record<Gravite, number>> = {
  info: 0,
  attention: 1,
  importante: 2,
  critique: 3,
};

/** Une phrase pour une règle ; jamais le libellé de l'analyse, qui peut contenir un prix ou un domaine. */
export function phraseSignal(id: string, gravite: Gravite): string {
  if (gravite === "attention" && fr.partage.signauxNuances[id]) {
    return fr.partage.signauxNuances[id];
  }
  return fr.partage.signaux[id] ?? fr.partage.signalParGravite[gravite];
}

/** Écart au prix d'occasion habituel, arrondi à 5 % : assez pour le message, pas pour retrouver une annonce. */
export function libelleEcartPrix(ecartPct: number): string {
  const arrondi = Math.round(ecartPct / 5) * 5;
  if (arrondi === 0) return fr.partage.ecartPrix.dans;
  return arrondi < 0
    ? fr.partage.ecartPrix.sous(Math.min(100, Math.abs(arrondi)))
    : fr.partage.ecartPrix.au_dessus(arrondi);
}

function libelleSite(lu: Plateforme | null, choisi: Plateforme | null): string | null {
  const site = lu ?? choisi;
  return site && site !== "autre" ? fr.partage.annonce(fr.lienAnnonce.sites[site]) : null;
}

/**
 * Construit les données de la carte de partage.
 *
 * - Seuls les signaux des règles sont repris, par leur phrase fixe : le texte de l'IA peut citer un
 *   pseudo ou un message, et les libellés des règles contiennent parfois un prix exact ou un
 *   domaine. Les signaux de l'IA ne sont comptés que dans « + N autres signaux ».
 * - Les trois plus graves (« attention » ou plus) ; un rassurant des règles, s'il y en a un.
 * - L'écart de prix n'apparaît que pour une comparaison fiable, arrondi à 5 %. Aucun montant.
 */
export function construireCarte(entree: EntreeCarte): DonneesCarte {
  const { resultat } = entree;
  const prix = entree.prix;
  const ecartPrix =
    prix?.statut === "ok" && prix.comparaison?.fiable
      ? libelleEcartPrix(prix.comparaison.ecart_pct)
      : null;

  // Le prix est dit par la pastille : inutile de le répéter dans la liste.
  const alertes = resultat.signaux.filter(
    (s) => RANG[s.gravite] >= RANG.attention && !(ecartPrix !== null && s.id.startsWith("prix.")),
  );
  const regles = alertes
    .filter((s) => s.source === "regle")
    .sort((a, b) => RANG[b.gravite] - RANG[a.gravite]);
  const vues = new Set<string>();
  const phrases: Array<{ texte: string; gravite: Gravite }> = [];
  for (const s of regles) {
    const texte = phraseSignal(s.id, s.gravite);
    if (vues.has(texte)) continue;
    vues.add(texte);
    phrases.push({ texte, gravite: s.gravite });
  }
  const alertesIa = alertes.length - regles.length;
  const signaux = phrases.slice(0, MAX_SIGNAUX_CARTE);
  const autres = phrases.length - signaux.length + alertesIa;

  const idRassurant = resultat.rassurants.find(
    (r) => r.source === "regle" && fr.partage.rassurants[r.id] !== undefined,
  )?.id;

  return {
    score: resultat.score,
    niveau: resultat.niveau,
    titreNiveau: fr.niveaux[resultat.niveau].titre,
    signaux:
      signaux.length > 0
        ? signaux
        : [{ texte: fr.partage.sansSignal[resultat.niveau], gravite: "info" }],
    autres: signaux.length > 0 ? autres : 0,
    rassurant: idRassurant ? (fr.partage.rassurants[idRassurant] ?? null) : null,
    site: libelleSite(resultat.donnees_extraites.plateforme, entree.site),
    ecartPrix,
    hote: entree.hote,
    accroche: fr.partage.accroche,
    mention: fr.partage.mention,
  };
}
