import { estimerCout, estimerCoutMaximal } from "../ai/tarifs";
import type { EvaluerIa, ImageEntree } from "../ai/types";
import { analyserDemande, type ResultatDemande, type SuiviIa } from "../analyze/pipeline";
import {
  AnalyzeTextInputSchema,
  MAX_IMAGES,
  MAX_REQUEST_BYTES,
  aUneEntree,
  trancheDeScore,
  type AnalyzeResponse,
  type RaisonPartielle,
} from "../contracts";
import { fr } from "../copy/fr";
import {
  extraireIp,
  hasherIp,
  iaAutorisee,
  lireFormData,
  regulariser,
  reserver,
  validerImages,
  verifierDebit,
  type Reservation,
} from "../security";
import { DUREE_ID_ANALYSE_S, cleAnalyse, encoderAnalyse } from "./cles";
import { compterAnalyse } from "./compteur";
import type { DependancesApi } from "./deps";
import { reponseErreur, reponseJson, requeteInterSites, secondesJusquaMinuitUtc } from "./reponses";

/** Pourquoi l'IA n'a pas été utilisée pour cette demande, alors qu'elle aurait pu l'être. */
type IaCoupee = "plafond" | "indisponible" | null;

/**
 * Coût à inscrire au plafond une fois l'appel terminé. `null` garde la réservation (coût
 * inconnu ou appel possiblement facturé malgré un délai dépassé) ; 0 la rend entièrement.
 */
function coutReel(ia: SuiviIa | undefined, modele: string): number | null {
  if (!ia || ia.statut === "absente") return 0;
  if (ia.statut === "ok") return estimerCout(ia.modele, ia.usage);
  if (ia.usage) return estimerCout(modele, ia.usage);
  return ia.raison === "delai" ? null : 0;
}

function partielle(
  ia: SuiviIa,
  mode: "complet" | "regles_seules",
  iaCoupee: IaCoupee,
): AnalyzeResponse["partielle"] {
  if (mode === "complet") return null;
  // Un lien analysé seul n'a rien à faire lire à l'IA : ce n'est pas une analyse « partielle ».
  if (ia.statut === "absente" && ia.motif === "non_necessaire") return null;
  const raison: RaisonPartielle = iaCoupee === "plafond" ? "forte_affluence" : "ia_indisponible";
  return {
    raison,
    message: raison === "forte_affluence" ? fr.forteAffluence : fr.analysePartielle,
  };
}

/**
 * `POST /api/v1/analyze` (multipart : `images` ×3 au plus, `texte`, `lien`).
 *
 * Ordre voulu : origine → rate limit (avant de lire le corps, pour ne pas faire travailler le
 * serveur pour rien) → lecture bornée → validation → réservation du plafond de dépense →
 * analyse → régularisation. Rien du contenu n'est stocké ni journalisé.
 */
export async function traiterAnalyse(request: Request, deps: DependancesApi): Promise<Response> {
  if (requeteInterSites(request.headers)) return reponseErreur("entree_invalide", { statut: 403 });
  if (!(request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    return reponseErreur("entree_invalide", { statut: 415 });
  }

  const maintenant = deps.maintenant();
  let stockageFiable = true;

  // 1. Rate limit par IP hashée. Si le stockage est en panne, on laisse passer (une analyse
  //   « règles seules » ne coûte rien) mais l'IA sera coupée plus bas.
  const cleIp = hasherIp(extraireIp(request.headers), deps.secretIp);
  try {
    const debit = await verifierDebit(
      deps.stockage,
      cleIp,
      { parHeure: deps.config.limiteParHeure, parJour: deps.config.limiteParJour },
      maintenant.getTime(),
    );
    if (!debit.ok)
      return reponseErreur("trop_de_requetes", { reessayerDansS: debit.reessayerDansS });
  } catch {
    stockageFiable = false;
  }

  // 2. Lecture bornée et validation.
  const corps = await lireFormData(request, MAX_REQUEST_BYTES);
  if (!corps.ok) {
    return corps.raison === "trop_gros"
      ? reponseErreur("entree_invalide", {
          statut: 413,
          message: fr.erreursPrecises.requeteTropVolumineuse,
        })
      : reponseErreur("entree_invalide", { message: fr.erreursPrecises.corpsIllisible });
  }
  const form = corps.valeur;

  const fichiers = form.getAll("images");
  if (fichiers.length > MAX_IMAGES) {
    return reponseErreur("entree_invalide", { message: fr.erreursPrecises.tropDImages });
  }
  if (!fichiers.every((f): f is File => typeof f !== "string")) {
    return reponseErreur("image_invalide");
  }
  const champTexte = form.get("texte");
  const champLien = form.get("lien");
  if (
    (champTexte !== null && typeof champTexte !== "string") ||
    (champLien !== null && typeof champLien !== "string")
  ) {
    return reponseErreur("entree_invalide");
  }
  const texte = AnalyzeTextInputSchema.safeParse({
    texte: champTexte ?? undefined,
    lien: champLien ?? undefined,
  });
  if (!texte.success) return reponseErreur("entree_invalide");

  const validation = await validerImages(fichiers);
  if (!validation.ok) {
    return validation.raison === "format"
      ? reponseErreur("image_invalide")
      : validation.raison === "nombre"
        ? reponseErreur("entree_invalide", { message: fr.erreursPrecises.tropDImages })
        : reponseErreur("image_invalide", { message: fr.erreursPrecises.imageTropLourde });
  }
  const images: ImageEntree[] = validation.images;
  if (!aUneEntree(texte.data, images.length)) return reponseErreur("entree_invalide");

  // 3. Plafond de dépense : on réserve le coût maximal avant d'appeler l'IA.
  const aDuContenu = images.length > 0 || Boolean(texte.data.texte);
  let iaCoupee: IaCoupee = null;
  let reservation: Reservation | null = null;
  if (aDuContenu && deps.evaluateur) {
    if (!iaAutorisee(deps.config).autorisee || !stockageFiable) {
      iaCoupee = "indisponible";
    } else {
      try {
        const r = await reserver(deps.stockage, {
          plafondUsd: deps.config.plafondJournalierUsd,
          estimationUsd: estimerCoutMaximal(deps.configIa.model, {
            images: images.length,
            caracteresTexte: texte.data.texte?.length ?? 0,
            maxTokens: deps.configIa.maxTokens,
          }),
          maintenant,
        });
        if (r.ok) reservation = r.reservation;
        else iaCoupee = "plafond";
      } catch {
        iaCoupee = "indisponible";
      }
    }
  }
  const evaluerIa: EvaluerIa | null = reservation ? deps.evaluateur : null;

  // 4. Analyse.
  let resultat: ResultatDemande;
  try {
    resultat = await analyserDemande(
      { images, texte: texte.data.texte ?? null, lien: texte.data.lien ?? null },
      { evaluerIa, maintenant: deps.maintenant },
    );
  } catch {
    // Coût inconnu : on garde la réservation entière.
    return reponseErreur("erreur_interne");
  }

  if (reservation) {
    try {
      await regulariser(deps.stockage, reservation, coutReel(resultat.ia, deps.configIa.model));
    } catch {
      // La réservation reste inscrite : au pire le plafond est atteint un peu plus tôt.
    }
  }

  // 5. Réponse.
  if (!resultat.ok) {
    if (resultat.code === "ia_indisponible" && iaCoupee === "plafond") {
      return reponseErreur("plafond_atteint", {
        reessayerDansS: secondesJusquaMinuitUtc(maintenant),
      });
    }
    return reponseErreur(resultat.code, {
      reessayerDansS: resultat.code === "ia_indisponible" ? 60 : undefined,
    });
  }

  const analyseId = crypto.randomUUID();
  try {
    // Ce que le serveur retiendra pour le vote : le mode et la tranche de score, rien d'autre.
    await deps.stockage.poser(
      cleAnalyse(analyseId),
      encoderAnalyse(resultat.resultat.meta.mode, trancheDeScore(resultat.resultat.score)),
      DUREE_ID_ANALYSE_S,
    );
  } catch {
    // Sans identifiant enregistré, le vote sera simplement refusé : l'analyse reste servie.
  }
  await compterAnalyse(deps.stockage);

  const corpsReponse: AnalyzeResponse = {
    analyse_id: analyseId,
    resultat: resultat.resultat,
    partielle: partielle(resultat.ia, resultat.resultat.meta.mode, iaCoupee),
  };
  return reponseJson(corpsReponse);
}
