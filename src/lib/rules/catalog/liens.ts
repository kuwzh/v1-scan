import { rangGravite, type Gravite } from "../../contracts/signals";
import { fr } from "../../copy/fr";
import type { LienAnalyse } from "../../links/types";
import { HOTES_TELEGRAM, HOTES_WHATSAPP } from "../motifs";
import { PLANCHER_LIEN_CRITIQUE, POIDS_LIEN, constat } from "../poids";
import type { Constat, Regle } from "../types";

/**
 * Reprend les signaux de l'analyse de liens. Plusieurs liens peuvent lever le même signal :
 * on garde le plus grave de chaque sorte, pour ne pas compter deux fois la même chose.
 */
export const reglesLiens: Regle[] = [
  {
    nom: "signaux_de_liens",
    evaluer: (ctx) => {
      const meilleurs = new Map<string, { gravite: Gravite; label: string }>();
      for (const lien of ctx.liens) {
        for (const s of lien.signaux) {
          const actuel = meilleurs.get(s.id);
          if (!actuel || rangGravite(s.gravite) > rangGravite(actuel.gravite)) {
            meilleurs.set(s.id, { gravite: s.gravite, label: s.label });
          }
        }
      }
      const constats: Constat[] = [];
      for (const [id, { gravite, label }] of meilleurs) {
        const sensible = rangGravite(gravite) >= rangGravite("importante");
        constats.push(
          constat(id, label, gravite, POIDS_LIEN[gravite], {
            plancher: PLANCHER_LIEN_CRITIQUE,
            ...(sensible ? { conseil: fr.conseilsRegles.lien } : {}),
          }),
        );
      }
      return constats;
    },
  },
  {
    nom: "lien_externe",
    evaluer: (ctx) => {
      // Un lien sans signal mais inconnu : à vérifier. Les liens vers une messagerie sont
      // déjà traités par les règles de sortie de plateforme.
      const estMessagerie = (l: LienAnalyse) =>
        l.hote !== null && (HOTES_WHATSAPP.test(l.hote) || HOTES_TELEGRAM.test(l.hote));
      const aVerifier = ctx.liens.some(
        (l) => l.verdict === "inconnu" && l.signaux.length === 0 && !estMessagerie(l),
      );
      return aVerifier
        ? [constat("liens.externe", fr.regles.liens.externe, "attention", 0.12)]
        : [];
    },
  },
];
