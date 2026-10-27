import { AiEvaluationSchema, type AiEvaluation } from "../contracts/ai";
import {
  completerConfiance,
  donneesExtraitesVides,
  type Confiance,
  type ExtractedData,
} from "../contracts/extracted";
import { MAX_URL_CHARS } from "../contracts/limits";
import { refanger } from "../links/normalize";
import { normaliserTexte } from "../rules/texte";
import type { AvertissementsIa } from "./types";
import type { ReponseModele } from "./wire";

const MAX_MESSAGES = 150;
const MAX_LIENS = 20;
const MAX_LONGUEUR_MESSAGE = 4_000;

/** Bornes de plausibilité : au-delà, la valeur est écartée (null) plutôt que crue. */
const BORNES = {
  prix_eur: [0, 1_000_000],
  nombre_photos: [0, 50],
  anciennete_jours: [0, 36_500],
  nombre_avis: [0, 1_000_000],
  note_sur_5: [0, 5],
  nombre_annonces: [0, 100_000],
} as const;

type Valeurs = Record<string, unknown>;

function texteOuNull(valeur: string | null, max: number): string | null {
  const texte = (valeur ?? "").replace(/\s+/g, " ").trim();
  return texte === "" ? null : texte.slice(0, max);
}

function nombreBorne(
  valeur: number | null,
  [min, max]: readonly [number, number],
  entier: boolean,
): number | null {
  if (valeur === null || !Number.isFinite(valeur) || valeur < min || valeur > max) return null;
  return entier ? Math.round(valeur) : Math.round(valeur * 100) / 100;
}

/** Texte comparable : minuscules, sans accents ni ponctuation, espaces réguliers. */
function comparable(texte: string): string {
  return normaliserTexte(texte)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Ce message figure-t-il dans le texte collé ? Recherche exacte d'abord, puis tolérante (au
 * moins 80 % de ses mots du texte source), car l'IA remplace les noms par [nom] et peut
 * recopier un peu différemment. Un message qui n'y est pas du tout est une invention.
 */
function messagePresentDans(source: string, message: string): boolean {
  const cible = comparable(message);
  if (cible === "") return false;
  if (source.includes(cible)) return true;
  const mots = cible.split(" ").filter((m) => m.length >= 3 && m !== "nom");
  if (mots.length === 0) return false;
  const motsSource = new Set(source.split(" "));
  return mots.filter((m) => motsSource.has(m)).length / mots.length >= 0.8;
}

function lienPresentDans(sourceCompacte: string, lien: string): boolean {
  const cible = refanger(lien)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^(?:https?:\/\/)?(?:www\.)?/, "")
    .replace(/\/+$/, "");
  return cible.length > 0 && sourceCompacte.includes(cible);
}

export interface OptionsNormalisation {
  /**
   * Texte collé par l'utilisateur, quand il n'y a aucune capture : sert à écarter les messages
   * et les liens que l'IA aurait inventés. Avec des captures, on ne peut pas le vérifier.
   */
  texteSource?: string | null;
}

/**
 * Passe de la réponse brute du modèle à une évaluation sûre :
 *
 * - les valeurs aberrantes sont remises à `null` (jamais corrigées ni devinées) ;
 * - une donnée présente sans confiance reçoit la confiance « basse », donc les règles
 *   l'ignorent ; une donnée absente n'a pas de confiance ;
 * - une note avec « 0 avis » est incohérente (rien à noter) : écartée ;
 * - avec du texte collé et sans capture, tout message ou lien qui n'y figure pas est retiré.
 */
export function normaliserReponse(
  reponse: ReponseModele,
  options: OptionsNormalisation = {},
): { evaluation: AiEvaluation; avertissements: AvertissementsIa } {
  const avertissements: AvertissementsIa = {
    messagesEcartes: 0,
    liensEcartes: 0,
    valeursInvalides: [],
  };
  const brut = reponse.donnees_extraites;
  const donnees: ExtractedData = donneesExtraitesVides();

  donnees.plateforme = brut.plateforme;
  donnees.ecrans = [...new Set(brut.ecrans)];

  donnees.annonce.titre = texteOuNull(brut.annonce.titre, 200);
  donnees.annonce.marque = texteOuNull(brut.annonce.marque, 80);
  donnees.annonce.modele = texteOuNull(brut.annonce.modele, 120);
  donnees.annonce.etat = texteOuNull(brut.annonce.etat, 80);
  donnees.annonce.categorie = texteOuNull(brut.annonce.categorie, 80);
  donnees.annonce.description = texteOuNull(brut.annonce.description, 4_000);
  donnees.vendeur.localisation = texteOuNull(brut.vendeur.localisation, 120);
  donnees.vendeur.profil_verifie = brut.vendeur.profil_verifie;

  const nombres: Array<["annonce" | "vendeur", keyof typeof BORNES, number | null, boolean]> = [
    ["annonce", "prix_eur", brut.annonce.prix_eur, false],
    ["annonce", "nombre_photos", brut.annonce.nombre_photos, true],
    ["vendeur", "anciennete_jours", brut.vendeur.anciennete_jours, true],
    ["vendeur", "nombre_avis", brut.vendeur.nombre_avis, true],
    ["vendeur", "note_sur_5", brut.vendeur.note_sur_5, false],
    ["vendeur", "nombre_annonces", brut.vendeur.nombre_annonces, true],
  ];
  for (const [groupe, cle, valeur, entier] of nombres) {
    const borne = nombreBorne(valeur, BORNES[cle], entier);
    if (valeur !== null && borne === null) avertissements.valeursInvalides.push(`${groupe}.${cle}`);
    (donnees[groupe] as Valeurs)[cle] = borne;
  }
  if (donnees.vendeur.nombre_avis === 0 && donnees.vendeur.note_sur_5 !== null) {
    donnees.vendeur.note_sur_5 = null;
    avertissements.valeursInvalides.push("vendeur.note_sur_5 (avec 0 avis)");
  }

  // Confiance : celle annoncée par l'IA, « basse » si elle l'a oubliée, absente si la donnée l'est.
  const annoncee = brut.confiance;
  for (const groupe of ["annonce", "vendeur"] as const) {
    const cibles = donnees.confiance[groupe] as Record<string, Confiance | null>;
    const sources = annoncee[groupe] as Record<string, Confiance | null>;
    for (const cle of Object.keys(cibles)) cibles[cle] = sources[cle] ?? null;
  }
  const complete = completerConfiance(donnees, "basse");

  // Messages et liens, avec contrôle d'ancrage dans le texte collé quand c'est possible.
  const verifierAncrage = !!options.texteSource?.trim() && options.texteSource !== undefined;
  const source = verifierAncrage ? comparable(options.texteSource ?? "") : "";
  const sourceCompacte = verifierAncrage
    ? refanger(options.texteSource ?? "")
        .toLowerCase()
        .replace(/\s+/g, "")
    : "";

  for (const m of brut.messages) {
    const texte = texteOuNull(m.texte, MAX_LONGUEUR_MESSAGE);
    if (texte === null) continue;
    if (verifierAncrage && !messagePresentDans(source, texte)) {
      avertissements.messagesEcartes++;
      continue;
    }
    if (complete.messages.length < MAX_MESSAGES) {
      complete.messages.push({ auteur: m.auteur, confiance: m.confiance, texte });
    }
  }

  const vus = new Set<string>();
  for (const lien of brut.liens) {
    const propre = lien.trim().slice(0, MAX_URL_CHARS);
    if (propre === "" || vus.has(propre.toLowerCase())) continue;
    vus.add(propre.toLowerCase());
    if (verifierAncrage && !lienPresentDans(sourceCompacte, propre)) {
      avertissements.liensEcartes++;
      continue;
    }
    if (complete.liens.length < MAX_LIENS) complete.liens.push(propre);
  }

  const evaluation = AiEvaluationSchema.parse({
    donnees_extraites: complete,
    contenu_exploitable: reponse.contenu_exploitable,
    score: Math.min(
      100,
      Math.max(0, Math.round(Number.isFinite(reponse.score) ? reponse.score : 0)),
    ),
    niveau: reponse.niveau,
    signaux: reponse.signaux
      .map((s) => ({ label: s.label.trim().slice(0, 400), gravite: s.gravite }))
      .filter((s) => s.label !== "")
      .slice(0, 12),
    rassurants: reponse.rassurants
      .map((r) => ({ label: r.label.trim().slice(0, 400) }))
      .filter((r) => r.label !== "")
      .slice(0, 8),
    conseils: reponse.conseils
      .map((c) => c.trim().slice(0, 400))
      .filter((c) => c !== "")
      .slice(0, 8),
  });

  return { evaluation, avertissements };
}

/** Aucune donnée exploitable : ni annonce, ni profil, ni message, ni lien. */
export function donneesVides(donnees: ExtractedData): boolean {
  const a = donnees.annonce;
  const v = donnees.vendeur;
  const aucuneAnnonce = [
    a.titre,
    a.prix_eur,
    a.marque,
    a.categorie,
    a.description,
    a.nombre_photos,
  ].every((x) => x === null);
  const aucunVendeur = Object.values(v).every((x) => x === null);
  return (
    aucuneAnnonce && aucunVendeur && donnees.messages.length === 0 && donnees.liens.length === 0
  );
}
