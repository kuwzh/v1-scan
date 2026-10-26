import { fr } from "../../copy/fr";
import { MOTIFS } from "../motifs";
import { constat } from "../poids";
import { autour, chercher, chercherTous, demandeAutour } from "../texte";
import type { Regle } from "../types";

const t = fr.regles.paiement;
const c = fr.conseilsRegles;

/**
 * Paiement hors plateforme. Les modes de paiement courants (virement, PayPal…) se lisent
 * aussi dans la description. Les demandes graves (carte, code, mandat) ne se lisent que
 * dans la conversation : une annonce qui vend une carte cadeau n'en demande pas une.
 */
export const reglesPaiement: Regle[] = [
  {
    nom: "virement",
    evaluer: (ctx) => {
      const trouve = chercher(ctx.segments, MOTIFS.virement);
      if (!trouve) return [];
      // Sur Leboncoin ou Marketplace, ou quand le virement est proposé à côté d'espèces ou d'une
      // remise en main propre, il s'agit d'une vente locale : poids réduit.
      const local = ctx.plateformeLocale || MOTIFS.venteLocale.test(autour(trouve, 90, 90));
      return local
        ? [constat("paiement.virement", t.virement, "attention", 0.24, { conseil: c.paiementHors })]
        : [
            constat("paiement.virement", t.virement, "importante", 0.38, {
              conseil: c.paiementHors,
            }),
          ];
    },
  },
  {
    nom: "paypal",
    evaluer: (ctx) => {
      const trouve = chercher(ctx.segments, MOTIFS.paypal);
      if (!trouve) return [];
      if (MOTIFS.paypalProches.test(autour(trouve, 60, 80))) {
        return [
          constat("paiement.paypal_proches", t.paypalProches, "importante", 0.45, {
            conseil: c.paypalProches,
          }),
        ];
      }
      return ctx.plateformeLocale
        ? [constat("paiement.paypal", t.paypal, "info", 0.1, { conseil: c.paiementHors })]
        : [constat("paiement.paypal", t.paypal, "attention", 0.2, { conseil: c.paiementHors })];
    },
  },
  {
    nom: "lydia",
    evaluer: (ctx) =>
      chercher(ctx.segments, MOTIFS.lydia)
        ? [
            ctx.plateformeLocale
              ? constat("paiement.lydia", t.lydia, "info", 0.06, { conseil: c.paiementHors })
              : constat("paiement.lydia", t.lydia, "attention", 0.22, { conseil: c.paiementHors }),
          ]
        : [],
  },
  {
    nom: "cheque",
    evaluer: (ctx) =>
      chercher(ctx.segments, MOTIFS.cheque)
        ? [
            ctx.plateformeLocale
              ? constat("paiement.cheque", t.cheque, "info", 0.1, { conseil: c.paiementHors })
              : constat("paiement.cheque", t.cheque, "attention", 0.2, { conseil: c.paiementHors }),
          ]
        : [],
  },
  {
    nom: "acompte",
    evaluer: (ctx) =>
      chercher(ctx.segments, MOTIFS.acompte)
        ? [constat("paiement.acompte", t.acompte, "importante", 0.32, { conseil: c.acompte })]
        : [],
  },
  {
    nom: "mandat_carte_cadeau",
    evaluer: (ctx) =>
      chercher(ctx.messages, MOTIFS.mandatCarteCadeau) || chercher(ctx.messages, MOTIFS.crypto)
        ? [
            constat("paiement.mandat_carte_cadeau", t.mandatCarteCadeau, "critique", 0.6, {
              plancher: 75,
              conseil: c.mandatCarteCadeau,
            }),
          ]
        : [],
  },
  {
    nom: "coordonnees_bancaires",
    evaluer: (ctx) => {
      // On demande ces informations : un nom de donnée sensible doit être près d'un verbe de demande.
      const demande = chercherTous(ctx.messages, MOTIFS.carteBancaire).some((trouve) =>
        demandeAutour(trouve, MOTIFS.verbeDemande),
      );
      return demande
        ? [
            constat("paiement.coordonnees_bancaires", t.coordonneesBancaires, "critique", 0.8, {
              plancher: 85,
              conseil: c.coordonnees,
            }),
          ]
        : [];
    },
  },
  {
    nom: "code_sms",
    evaluer: (ctx) => {
      const demande = chercherTous(ctx.messages, MOTIFS.codeSensible).some((trouve) =>
        demandeAutour(trouve, MOTIFS.verbeDemande),
      );
      return demande
        ? [
            constat("paiement.code_sms", t.codeSms, "critique", 0.85, {
              plancher: 85,
              conseil: c.code,
            }),
          ]
        : [];
    },
  },
];
