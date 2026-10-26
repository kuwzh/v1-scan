import { fr } from "../../copy/fr";
import { analyserHote } from "../../links/domain";
import { OFFICIELS } from "../../links/marques";
import { HOTES_TELEGRAM, HOTES_WHATSAPP, MOTIFS } from "../motifs";
import { constat } from "../poids";
import { autour, chercher, chercherTous } from "../texte";
import type { Regle } from "../types";

const t = fr.regles.plateforme;
const conseil = fr.conseilsRegles.horsPlateforme;

/** Sortie de plateforme : WhatsApp, Telegram, SMS, téléphone, e-mail, autres réseaux. */
export const reglesPlateforme: Regle[] = [
  {
    nom: "whatsapp",
    evaluer: (ctx) => {
      const dansTexte = chercher(ctx.segments, MOTIFS.whatsapp);
      const dansLien = ctx.liens.some((l) => l.hote !== null && HOTES_WHATSAPP.test(l.hote));
      if (!dansTexte && !dansLien) return [];
      return [constat("plateforme.whatsapp", t.whatsapp, "importante", 0.4, { conseil })];
    },
  },
  {
    nom: "telegram",
    evaluer: (ctx) => {
      const dansTexte = chercher(ctx.segments, MOTIFS.telegram);
      const dansLien = ctx.liens.some((l) => l.hote !== null && HOTES_TELEGRAM.test(l.hote));
      if (!dansTexte && !dansLien) return [];
      return [constat("plateforme.telegram", t.telegram, "importante", 0.4, { conseil })];
    },
  },
  {
    nom: "autre_reseau",
    evaluer: (ctx) =>
      chercher(ctx.segments, MOTIFS.autreReseau)
        ? [constat("plateforme.autre_reseau", t.autreReseau, "attention", 0.25, { conseil })]
        : [],
  },
  {
    nom: "hors_plateforme",
    evaluer: (ctx) =>
      chercher(ctx.segments, MOTIFS.horsPlateforme)
        ? [constat("plateforme.hors_plateforme", t.horsPlateforme, "importante", 0.4, { conseil })]
        : [],
  },
  {
    nom: "sms",
    evaluer: (ctx) => {
      const trouve = chercher(ctx.segments, MOTIFS.sms);
      // « envoie-moi le code par SMS » relève de la règle sur les codes, pas d'ici.
      if (!trouve || /\bcode\b/.test(autour(trouve, 30, 30))) return [];
      return ctx.plateformeLocale
        ? [constat("plateforme.sms", t.sms, "info", 0.08, { conseil })]
        : [constat("plateforme.sms", t.sms, "attention", 0.22, { conseil })];
    },
  },
  {
    nom: "telephone",
    evaluer: (ctx) => {
      const trouve =
        chercher(ctx.segments, MOTIFS.telephoneFr) ?? chercher(ctx.segments, MOTIFS.telephoneIntl);
      if (!trouve) return [];
      // Sur Leboncoin, donner son numéro est courant : le signal pèse peu.
      return ctx.plateformeLocale
        ? [constat("plateforme.telephone", t.telephone, "info", 0.08, { conseil })]
        : [constat("plateforme.telephone", t.telephone, "attention", 0.22, { conseil })];
    },
  },
  {
    nom: "email",
    evaluer: (ctx) => {
      // Une adresse d'un domaine officiel (message système collé, par exemple) n'est pas une sortie.
      const adresseHorsOfficiel = chercherTous(ctx.segments, MOTIFS.email).some((trouve) => {
        const domaine = analyserHote(trouve.extrait.split("@").pop() ?? "").domaine;
        return !(domaine && OFFICIELS.has(domaine));
      });
      const trouve = adresseHorsOfficiel || chercher(ctx.segments, MOTIFS.emailMention);
      if (!trouve) return [];
      return ctx.plateformeLocale
        ? [constat("plateforme.email", t.email, "info", 0.08, { conseil })]
        : [constat("plateforme.email", t.email, "attention", 0.2, { conseil })];
    },
  },
];
