import { estimerCoutRecherche, estimerCoutRechercheMaximal } from "../ai/tarifs";
import type { RaisonEchecIa } from "../ai/types";
import { PrixInputSchema, type EstimationPrix, type PrixResponse } from "../contracts";
import { fr } from "../copy/fr";
import {
  cleCachePrix,
  comparerPrix,
  decoderProduit,
  ecrireEstimationCache,
  lireEstimationCache,
  recalculerAvecPrix,
  signalPourPrix,
} from "../prix";
import {
  extraireIp,
  hasherIp,
  iaAutorisee,
  lireJson,
  regulariser,
  reserver,
  verifierDebit,
  type Reservation,
} from "../security";
import { clePrixProduit } from "./cles";
import type { DependancesApi } from "./deps";
import { reponseErreur, reponseJson, requeteInterSites, secondesJusquaMinuitUtc } from "./reponses";

/**
 * Tous les appels (cache compris) sont comptés largement : la limite stricte ne vaut que pour les
 * recherches, voir `ConfigPrix`. Elle sert à ne pas laisser marteler le stockage.
 */
const LIMITE_APPELS = { parHeure: 30, parJour: 100 };
const MAX_CORPS_PRIX = 1_024;

/** Échecs de la recherche qui relèvent de la configuration ou de nos réglages : à voir dans les journaux. */
const ECHECS_A_JOURNALISER: ReadonlySet<RaisonEchecIa> = new Set([
  "configuration",
  "reponse_invalide",
  "tronquee",
]);

function reponseResultat(
  estimation: EstimationPrix | null,
  prixAnnonceEur: number,
  contexte: Parameters<typeof recalculerAvecPrix>[0],
  depuisCache: boolean,
): PrixResponse {
  const comparaison = estimation ? comparerPrix(prixAnnonceEur, estimation) : null;
  const signal = estimation ? signalPourPrix(prixAnnonceEur, estimation, comparaison) : null;
  const recalcul = recalculerAvecPrix(contexte, signal);
  return {
    statut: comparaison ? "ok" : "introuvable",
    estimation,
    comparaison,
    // Le signal n'est renvoyé que s'il compte : sinon (prix normal, estimation peu sûre, ou signal
    // de la table plus grave) la liste des signaux ne bouge pas.
    signal: recalcul.signalApplique && signal ? signal.signal : null,
    resultat: {
      score: recalcul.score,
      niveau: recalcul.niveau,
      signaux_retires: recalcul.signauxRetires,
    },
    depuis_cache: depuisCache,
  };
}

/**
 * `POST /api/v1/prix` : `{ analyse_id }`. Compare le prix de l'annonce à ceux du neuf et de
 * l'occasion, estimés par une recherche en ligne, et renvoie le signal de risque et le score mis à
 * jour.
 *
 * - L'article et le prix viennent du serveur (enregistrés par l'analyse), jamais du client.
 * - Une estimation en cache (marque, modèle, état) ne coûte rien. Sinon : limite par IP propre aux
 *   recherches → réservation du plafond de dépense → recherche → règlement du coût réel
 *   (recherches et jetons).
 * - Sans clé d'API, sans stockage partagé ou sans secret d'IP, la recherche n'a pas lieu : comme
 *   pour l'analyse, aucune dépense sans plafond ni limite.
 */
export async function traiterPrix(request: Request, deps: DependancesApi): Promise<Response> {
  if (requeteInterSites(request.headers)) return reponseErreur("entree_invalide", { statut: 403 });

  const maintenant = deps.maintenant();
  const cleIp = hasherIp(extraireIp(request.headers), deps.secretIp);
  try {
    const debit = await verifierDebit(
      deps.stockage,
      cleIp,
      LIMITE_APPELS,
      maintenant.getTime(),
      "prix-appels",
    );
    if (!debit.ok)
      return reponseErreur("trop_de_requetes", { reessayerDansS: debit.reessayerDansS });
  } catch {
    // Stockage en panne : la lecture de l'analyse échouera de toute façon plus bas.
  }

  const corps = await lireJson(request, MAX_CORPS_PRIX);
  if (!corps.ok) {
    return reponseErreur("entree_invalide", { statut: corps.raison === "trop_gros" ? 413 : 400 });
  }
  const entree = PrixInputSchema.safeParse(corps.valeur);
  if (!entree.success) return reponseErreur("entree_invalide");

  const autorisation = iaAutorisee(deps.config);
  if (!deps.estimerPrix || !autorisation.autorisee) {
    return reponseErreur("ia_indisponible", { message: fr.erreursPrecises.prixIndisponible });
  }

  // 1. L'article de l'analyse. Absent, expiré ou illisible : la comparaison n'est plus possible.
  let enregistre;
  try {
    enregistre = decoderProduit(
      await deps.stockage.lireTexte(clePrixProduit(entree.data.analyse_id)),
    );
  } catch {
    return reponseErreur("ia_indisponible", { message: fr.erreursPrecises.prixIndisponible });
  }
  if (!enregistre) return reponseErreur("comparaison_impossible");
  const { produit, contexte } = enregistre;

  // 2. Le cache : une estimation (marque, modèle, état) déjà payée vaut pour tout le monde.
  const cleCache = cleCachePrix(produit);
  try {
    const cache = await lireEstimationCache(deps.stockage, cleCache);
    if (cache.trouve) {
      return reponseJson(reponseResultat(cache.estimation, produit.prixEur, contexte, true));
    }
  } catch {
    // Cache illisible : la réservation ci-dessous échouera aussi si le stockage est vraiment en panne.
  }

  // 3. Limite propre aux recherches, puis réservation du plafond de dépense.
  try {
    const debit = await verifierDebit(
      deps.stockage,
      cleIp,
      { parHeure: deps.configPrix.limiteParHeure, parJour: deps.configPrix.limiteParJour },
      maintenant.getTime(),
      "prix",
    );
    if (!debit.ok) {
      return reponseErreur("trop_de_requetes", {
        reessayerDansS: debit.reessayerDansS,
        message: fr.erreursPrecises.prixTropDeRecherches,
      });
    }
  } catch {
    return reponseErreur("ia_indisponible", { message: fr.erreursPrecises.prixIndisponible });
  }

  let reservation: Reservation;
  try {
    const r = await reserver(deps.stockage, {
      plafondUsd: deps.config.plafondJournalierUsd,
      estimationUsd: estimerCoutRechercheMaximal(deps.configPrix.modele, {
        maxRecherches: deps.configPrix.maxRecherches,
        maxTokens: deps.configPrix.maxTokens,
      }),
      maintenant,
    });
    if (!r.ok) {
      return reponseErreur("plafond_atteint", {
        reessayerDansS: secondesJusquaMinuitUtc(maintenant),
        message: fr.erreursPrecises.prixAffluence,
      });
    }
    reservation = r.reservation;
  } catch {
    return reponseErreur("ia_indisponible", { message: fr.erreursPrecises.prixIndisponible });
  }

  // 4. La recherche, puis le règlement : coût réel, ou réservation gardée si on ne sait pas.
  let resultat;
  try {
    resultat = await deps.estimerPrix(
      {
        marque: produit.marque,
        modele: produit.modele,
        categorie: produit.categorie,
        etat: produit.etat,
      },
      maintenant.toISOString().slice(0, 10),
    );
  } catch {
    // L'estimateur ne lève pas ; si c'est pourtant le cas, le coût est inconnu.
    return reponseErreur("erreur_interne");
  }
  try {
    const cout = resultat.ok
      ? estimerCoutRecherche(resultat.modele, resultat.usage)
      : resultat.usage
        ? estimerCoutRecherche(deps.configPrix.modele, resultat.usage)
        : resultat.raison === "delai"
          ? null
          : 0;
    await regulariser(deps.stockage, reservation, cout);
  } catch {
    // La réservation reste inscrite : au pire le plafond est atteint un peu plus tôt.
  }

  if (!resultat.ok) {
    if (ECHECS_A_JOURNALISER.has(resultat.raison)) {
      // Ni contenu ni article : la raison et l'état HTTP ou les champs fautifs.
      console.error(
        `[gardo] recherche de prix en échec : ${resultat.raison}${resultat.detail ? ` (${resultat.detail})` : ""}`,
      );
    }
    return reponseErreur("ia_indisponible", {
      reessayerDansS: 60,
      message: fr.erreursPrecises.prixIndisponible,
    });
  }

  try {
    await ecrireEstimationCache(
      deps.stockage,
      cleCache,
      resultat.estimation,
      deps.configPrix.ttlCacheS,
    );
  } catch {
    // Pas de cache cette fois : la prochaine demande refera la recherche.
  }
  return reponseJson(reponseResultat(resultat.estimation, produit.prixEur, contexte, false));
}
