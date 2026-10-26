import { MAX_URL_CHARS } from "../contracts/limits";
import { analyserHote } from "./domain";

export type RaisonIllisible = "vide" | "trop_long" | "schema_non_supporte" | "adresse_invalide";

export interface LienNormalise {
  ok: true;
  /** Adresse complète nettoyée. */
  href: string;
  /** Hôte en ASCII, en minuscules, sans point final. */
  hote: string;
  /** Chemin, paramètres et ancre, décodés au mieux (sert à chercher des mots-clés). */
  chemin: string;
  /** Texte placé avant un « @ » dans l'adresse (`vinted.fr` dans `https://vinted.fr@site.com`). */
  identifiant: string | null;
  /** Nettoyages appliqués (codes), pour le diagnostic. */
  modifications: string[];
}

export interface LienIllisible {
  ok: false;
  raison: RaisonIllisible;
  modifications: string[];
}

export type ResultatNormalisation = LienNormalise | LienIllisible;

const INVISIBLES = /[­​-‏‪-‮⁠-⁤﻿]/g;
const SCHEMAS_REFUSES =
  /^(?:javascript|data|vbscript|file|ftp|mailto|tel|sms|blob|about|intent|ws|wss):/i;
/** `https://`, mais aussi `https:/`, `https//`, `https:` et `hxxps://` (liens « défangués »). */
const SCHEMA_HTTP = /^(h(?:tt|xx)ps?)(?::\/{0,3}|\/{1,3})/i;
const ENVELOPPE_DEBUT = /^[\s"'«»“”‘’<>()[\]{}]+/;
const ENVELOPPE_FIN = /[\s"'«»“”‘’<>()[\]{}.,;:!?]+$/;
const ETIQUETTE_HOTE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PONCTUATION_URL = /[./:\-_?=&#%@]/;

/** `vinted[.]fr` → `vinted.fr`, `hxxps[:]//…` → `https://…`. */
export function refanger(texte: string): string {
  return texte
    .replace(/\[\s*:\s*\/\s*\/\s*\]/g, "://")
    .replace(/\[\s*:\s*\]/g, ":")
    .replace(/[[({]\s*(?:\.|dot|point)\s*[\])}]/gi, ".")
    .replace(/[[({]\s*\/\s*[\])}]/g, "/")
    .replace(/\bhxxp(s?)\b/gi, "http$1");
}

export function retirerInvisibles(texte: string): string {
  return texte.replace(INVISIBLES, "");
}

function decoderSansErreur(texte: string): string {
  try {
    return decodeURIComponent(texte);
  } catch {
    return texte;
  }
}

/** Partie « hôte » d'un candidat, pour juger s'il ressemble à une adresse. */
function hoteDuCandidat(candidat: string): string {
  let reste = candidat.replace(SCHEMA_HTTP, "").replace(/^\/\//, "");
  reste = reste.split(/[/?#]/, 1)[0] ?? "";
  const arobase = reste.lastIndexOf("@");
  if (arobase >= 0) reste = reste.slice(arobase + 1);
  return reste.replace(/:\d{1,5}$/, "");
}

function hoteValide(hote: string): boolean {
  if (hote.length === 0 || hote.length > 253) return false;
  if (hote.startsWith("[")) return /^\[[0-9a-f:.]+\]$/i.test(hote);
  const etiquettes = hote.split(".");
  return etiquettes.length >= 2 && etiquettes.every((e) => ETIQUETTE_HOTE.test(e));
}

function ressembleAUneAdresse(candidat: string): boolean {
  const hote = hoteDuCandidat(candidat).toLowerCase();
  if (!hoteValide(hote)) return false;
  const analyse = analyserHote(hote);
  return analyse.estIp || analyse.suffixeConnu;
}

/**
 * Nettoie une adresse lue par l'IA ou copiée d'une conversation avant analyse :
 * espaces parasites, `[.]`, schéma absent ou abîmé, ponctuation autour, caractères
 * invisibles.
 *
 * Règle absolue : on ne touche jamais aux lettres de l'adresse. `vlnted.fr`, `1eboncoin.fr`
 * ou `vinted.fr.paiement-securise.com` ressortent tels quels. Rapprocher un domaine
 * suspect d'un domaine officiel serait faire disparaître le signal d'alerte.
 */
export function normaliserLien(brut: string): ResultatNormalisation {
  const modifications: string[] = [];
  const noter = (code: string) => {
    if (!modifications.includes(code)) modifications.push(code);
  };

  if (brut.length > MAX_URL_CHARS) return { ok: false, raison: "trop_long", modifications };

  let texte = brut;
  const sansInvisibles = retirerInvisibles(texte);
  if (sansInvisibles !== texte) noter("caracteres_invisibles_retires");
  texte = sansInvisibles;

  const unicode = texte.normalize("NFKC");
  if (unicode !== texte) noter("unicode_normalise");
  texte = unicode;

  const refange = refanger(texte);
  if (refange !== texte) noter("defanging");
  texte = refange.replace(ENVELOPPE_DEBUT, "").replace(ENVELOPPE_FIN, "");

  if (texte === "") return { ok: false, raison: "vide", modifications };

  // Espaces : un trou dans une adresse (retour à la ligne de l'OCR) se recolle ; un
  // texte autour de l'adresse s'ignore.
  let candidat = texte;
  const morceaux = texte.split(/\s+/).filter(Boolean);
  if (morceaux.length > 1) {
    const colle = morceaux.join("");
    const frontiereUrl = morceaux.slice(0, -1).some((m, i) => {
      const suivant = morceaux[i + 1] ?? "";
      const fin = m.slice(-1);
      return PONCTUATION_URL.test(fin) || PONCTUATION_URL.test(suivant.charAt(0));
    });
    if (frontiereUrl && ressembleAUneAdresse(colle)) {
      candidat = colle;
      noter("espaces_retires");
    } else {
      const premier = morceaux
        .map((m) => m.replace(ENVELOPPE_DEBUT, "").replace(ENVELOPPE_FIN, ""))
        .find(ressembleAUneAdresse);
      if (!premier) return { ok: false, raison: "adresse_invalide", modifications };
      candidat = premier;
      noter("texte_autour_ignore");
    }
  }

  const sansPonctuation = candidat.replace(ENVELOPPE_DEBUT, "").replace(ENVELOPPE_FIN, "");
  if (sansPonctuation !== candidat) noter("ponctuation_retiree");
  candidat = sansPonctuation;

  if (SCHEMAS_REFUSES.test(candidat)) {
    return { ok: false, raison: "schema_non_supporte", modifications };
  }

  let protocole = "https";
  let reste = candidat;
  const schema = candidat.match(SCHEMA_HTTP);
  if (schema) {
    protocole = (schema[1] ?? "https").toLowerCase().replace("xx", "tt");
    reste = candidat.slice(schema[0].length);
    if (schema[0].toLowerCase() !== `${protocole}://`) noter("schema_repare");
  } else {
    reste = candidat.replace(/^\/\//, "");
    noter("schema_ajoute");
  }

  let url: URL;
  try {
    url = new URL(`${protocole}://${reste}`);
  } catch {
    return { ok: false, raison: "adresse_invalide", modifications };
  }

  const hote = url.hostname.replace(/\.+$/, "").toLowerCase();
  if (!hoteValide(hote)) return { ok: false, raison: "adresse_invalide", modifications };

  const identifiant = url.username ? decoderSansErreur(url.username) : null;
  return {
    ok: true,
    href: url.href,
    hote,
    chemin: decoderSansErreur(`${url.pathname}${url.search}${url.hash}`),
    identifiant,
    modifications,
  };
}
