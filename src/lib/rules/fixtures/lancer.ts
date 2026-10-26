import { fusionnerScores } from "../../analyze/fusion";
import { niveauPourScore } from "../../contracts/niveau";
import { analyserLiens } from "../../links/analyse";
import { collecterLiensBruts } from "../contexte";
import { evaluerRegles } from "../moteur";
import { donneesDepuisCas, type CasConversation } from "./cas";

/** Exécute un cas comme le fera le pipeline, sans IA : liens analysés, règles, fusion. */
export function lancer(cas: CasConversation) {
  const donnees = donneesDepuisCas(cas);
  const liens = analyserLiens(collecterLiensBruts(donnees, cas.texte));
  const regles = evaluerRegles({ donnees, texte: cas.texte, liens });
  const fusion = fusionnerScores({
    scoreRegles: regles.score,
    scoreIa: null,
    plancher: regles.plancher,
    remise: regles.remise,
  });
  return { donnees, liens, regles, fusion, niveau: niveauPourScore(fusion.score) };
}
