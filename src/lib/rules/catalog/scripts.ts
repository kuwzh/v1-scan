import { fr } from "../../copy/fr";
import { MOTIFS } from "../motifs";
import { constat } from "../poids";
import { chercher, chercherTous, demandeAutour, existe } from "../texte";
import type { Contexte, Regle, Segment } from "../types";

const t = fr.regles.scripts;
const c = fr.conseilsRegles;

/** Vrai si le segment contient les deux motifs (hors passages niés). */
function lesDeux(segment: Segment, a: RegExp, b: RegExp): boolean {
  return existe([segment], a) && existe([segment], b);
}

/** Quelqu'un cherche-t-il à faire sortir de la plateforme ? */
function sortDeLaPlateforme(ctx: Contexte): boolean {
  return (
    existe(ctx.messages, MOTIFS.whatsapp) ||
    existe(ctx.messages, MOTIFS.telegram) ||
    existe(ctx.messages, MOTIFS.horsPlateforme) ||
    existe(ctx.messages, MOTIFS.virement)
  );
}

/**
 * Scénarios d'arnaque connus. Parler de colis, de frais ou de paiement sécurisé est normal en
 * soi : un signal « critique » n'est levé que si un lien jugé suspect par l'analyse vient
 * avec. Avec un simple lien inconnu, le signal reste « importante » ; sans lien, il n'est
 * pas levé (les autres règles et l'IA jugent le reste).
 */
export const reglesScripts: Regle[] = [
  {
    // « J'ai déjà payé, clique ici pour recevoir l'argent » : la formule est assez précise
    // pour qu'un lien inconnu suffise.
    nom: "paiement_effectue_lien",
    evaluer: (ctx) => {
      if (ctx.liensNonOfficiels.length === 0) return [];
      const declenche = ctx.messages.some((s) =>
        lesDeux(s, MOTIFS.paiementEffectue, MOTIFS.actionRecevoir),
      );
      return declenche
        ? [
            constat("script.paiement_effectue_lien", t.paiementEffectueLien, "critique", 0.75, {
              plancher: 80,
              conseil: c.paiementRecu,
            }),
          ]
        : [];
    },
  },
  {
    nom: "faux_transporteur",
    evaluer: (ctx) => {
      const declenche = ctx.messages.some((s) =>
        lesDeux(s, MOTIFS.transporteur, MOTIFS.fraisOuBlocage),
      );
      if (!declenche) return [];
      if (ctx.liensSuspects.length > 0) {
        return [
          constat("script.faux_transporteur", t.fauxTransporteur, "critique", 0.72, {
            plancher: 78,
            conseil: c.transporteur,
          }),
        ];
      }
      return ctx.liensNonOfficiels.length > 0
        ? [
            constat("script.faux_transporteur", t.fauxTransporteur, "importante", 0.4, {
              conseil: c.transporteur,
            }),
          ]
        : [];
    },
  },
  {
    nom: "frais_supplementaires",
    evaluer: (ctx) =>
      chercher(ctx.messages, MOTIFS.fraisSupplementaires)
        ? [
            constat("script.frais_supplementaires", t.fraisSupplementaires, "importante", 0.4, {
              conseil: c.transporteur,
            }),
          ]
        : [],
  },
  {
    nom: "paiement_securise_faux",
    evaluer: (ctx) => {
      if (!existe(ctx.messages, MOTIFS.paiementSecurise)) return [];
      const demandeCarte = chercherTous(ctx.messages, MOTIFS.carteBancaire).some((trouve) =>
        demandeAutour(trouve, MOTIFS.verbeDemande),
      );
      if (ctx.liensSuspects.length > 0 || demandeCarte) {
        return [
          constat("script.paiement_securise_faux", t.paiementSecuriseFaux, "critique", 0.7, {
            plancher: 75,
            conseil: c.paiementRecu,
          }),
        ];
      }
      return ctx.liensNonOfficiels.length > 0 || sortDeLaPlateforme(ctx)
        ? [
            constat("script.paiement_securise_faux", t.paiementSecuriseFaux, "importante", 0.4, {
              conseil: c.paiementRecu,
            }),
          ]
        : [];
    },
  },
  {
    nom: "trop_percu",
    evaluer: (ctx) =>
      chercher(ctx.messages, MOTIFS.tropPercu)
        ? [constat("script.trop_percu", t.tropPercu, "importante", 0.45, { conseil: c.tropPercu })]
        : [],
  },
  {
    nom: "rembourse_apres",
    evaluer: (ctx) =>
      chercher(ctx.messages, MOTIFS.rembourseApres)
        ? [
            constat("script.rembourse_apres", t.rembourseApres, "importante", 0.35, {
              conseil: c.tropPercu,
            }),
          ]
        : [],
  },
  {
    nom: "piece_identite",
    evaluer: (ctx) => {
      const demande = chercherTous(ctx.messages, MOTIFS.pieceIdentite).some((trouve) =>
        demandeAutour(trouve, MOTIFS.photoOuScan, 50, 40),
      );
      return demande
        ? [
            constat("script.piece_identite", t.pieceIdentite, "importante", 0.45, {
              conseil: c.identite,
            }),
          ]
        : [];
    },
  },
];
