import { fr } from "../../copy/fr";
import { constat } from "../poids";
import type { Reassurance, Regle, RegleRassurante } from "../types";
import { MOTIFS } from "../motifs";
import { chercher } from "../texte";

const t = fr.regles.profil;
const conseilRecent = fr.conseilsRegles.profilRecent;

/** Profil du vendeur : ancienneté, avis, note, volume d'annonces. */
export const reglesProfil: Regle[] = [
  {
    nom: "anciennete",
    evaluer: (ctx) => {
      const jours = ctx.donnees.vendeur.anciennete_jours;
      if (jours === null) return [];
      if (jours < 7) {
        return [
          constat("profil.compte_tres_recent", t.compteTresRecent, "importante", 0.38, {
            conseil: conseilRecent,
          }),
        ];
      }
      if (jours < 30) {
        return [
          constat("profil.compte_recent", t.compteRecent, "attention", 0.24, {
            conseil: conseilRecent,
          }),
        ];
      }
      if (jours < 90) {
        return [constat("profil.compte_assez_recent", t.compteAssezRecent, "info", 0.08)];
      }
      return [];
    },
  },
  {
    nom: "avis",
    evaluer: (ctx) => {
      const { nombre_avis: avis, note_sur_5: note } = ctx.donnees.vendeur;
      const constats = [];
      if (avis === 0) {
        // Les avis comptent moins sur Leboncoin et Marketplace que sur Vinted.
        constats.push(
          ctx.plateformeLocale
            ? constat("profil.aucun_avis", t.aucunAvis, "info", 0.06)
            : constat("profil.aucun_avis", t.aucunAvis, "attention", 0.2, {
                conseil: conseilRecent,
              }),
        );
      } else if (avis !== null && avis < 5) {
        constats.push(constat("profil.peu_d_avis", t.peuDAvis, "info", 0.07));
      }
      if (note !== null && avis !== null && avis >= 3) {
        if (note < 2.5)
          constats.push(constat("profil.note_tres_basse", t.noteTresBasse, "importante", 0.34));
        else if (note < 3.5)
          constats.push(constat("profil.note_basse", t.noteBasse, "attention", 0.22));
      }
      return constats;
    },
  },
  {
    nom: "volume_annonces",
    evaluer: (ctx) => {
      const { anciennete_jours: jours, nombre_annonces: annonces } = ctx.donnees.vendeur;
      if (jours === null || annonces === null || jours >= 30) return [];
      if (annonces >= 15) {
        return [
          constat(
            "profil.beaucoup_d_annonces",
            t.beaucoupDAnnoncesCompteRecent,
            "importante",
            0.35,
          ),
        ];
      }
      if (annonces >= 8) {
        return [
          constat("profil.beaucoup_d_annonces", t.beaucoupDAnnoncesCompteRecent, "attention", 0.2),
        ];
      }
      return [];
    },
  },
  {
    nom: "verification",
    evaluer: (ctx) =>
      ctx.donnees.vendeur.profil_verifie === false
        ? [constat("profil.non_verifie", t.nonVerifie, "info", 0.06)]
        : [],
  },
];

/**
 * Éléments rassurants. Seuls ceux qui viennent des données du profil (affichées par la
 * plateforme) font baisser le score, et de quelques points. Ce que dit le vendeur dans ses
 * messages est affiché mais ne compte pas : n'importe qui peut écrire « paiement via Vinted ».
 */
export const reglesRassurantes: RegleRassurante[] = [
  {
    nom: "anciennete",
    evaluer: (ctx): Reassurance[] => {
      const jours = ctx.donnees.vendeur.anciennete_jours;
      if (jours === null) return [];
      if (jours >= 730) return [{ id: "profil.compte_ancien", label: t.compteAncien, remise: 4 }];
      if (jours >= 365)
        return [{ id: "profil.compte_assez_ancien", label: t.compteAssezAncien, remise: 2 }];
      return [];
    },
  },
  {
    nom: "avis",
    evaluer: (ctx): Reassurance[] => {
      const { nombre_avis: avis, note_sur_5: note } = ctx.donnees.vendeur;
      if (avis === null || note === null) return [];
      if (avis >= 20 && note >= 4.5)
        return [{ id: "profil.nombreux_avis", label: t.nombreuxAvis, remise: 4 }];
      if (avis >= 10 && note >= 4.3)
        return [{ id: "profil.plusieurs_avis", label: t.plusieursAvis, remise: 2 }];
      return [];
    },
  },
  {
    nom: "verifie",
    evaluer: (ctx): Reassurance[] =>
      ctx.donnees.vendeur.profil_verifie === true
        ? [{ id: "profil.verifie", label: t.verifie, remise: 2 }]
        : [],
  },
  {
    nom: "paiement_plateforme",
    evaluer: (ctx, constats): Reassurance[] => {
      // Contradictoire dès qu'une règle voit un paiement ou une sortie hors plateforme.
      const contredit = constats.some((c) => /^(?:paiement|plateforme|script)\./.test(c.id));
      if (contredit || !chercher(ctx.segments, MOTIFS.paiementPlateforme)) return [];
      return [
        { id: "plateforme.paiement", label: fr.regles.rassurants.paiementPlateforme, remise: 0 },
      ];
    },
  },
];
