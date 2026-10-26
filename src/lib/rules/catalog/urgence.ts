import { fr } from "../../copy/fr";
import { MOTIFS } from "../motifs";
import { constat } from "../poids";
import { existe } from "../texte";
import type { Regle } from "../types";

const t = fr.regles.urgence;

/**
 * Pression pour aller vite. On compte les familles de formules distinctes dans la
 * conversation : « urgent » seul est courant, plusieurs formules d'affilée le sont moins.
 * La description n'est pas lue : « vente urgente, déménagement » n'est pas une pression.
 */
export const reglesUrgence: Regle[] = [
  {
    nom: "pression",
    evaluer: (ctx) => {
      const familles = MOTIFS.pression.filter((motif) => existe(ctx.messages, motif)).length;
      if (familles >= 2) {
        return [
          constat("urgence.forte", t.forte, "attention", 0.2, {
            conseil: fr.conseilsRegles.urgence,
          }),
        ];
      }
      if (familles === 1) return [constat("urgence.legere", t.legere, "info", 0.06)];
      return [];
    },
  },
];
