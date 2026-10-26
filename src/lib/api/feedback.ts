import { FeedbackInputSchema, VOTES, niveauPourScore, type Niveau, type Vote } from "../contracts";
import { extraireIp, hasherIp, lireJson, verifierDebit, type Stockage } from "../security";
import { cleAnalyse, cleFeedback } from "./cles";
import type { DependancesApi } from "./deps";
import { reponseErreur, reponseJson, requeteInterSites } from "./reponses";

/**
 * Le feedback ne coûte rien (pas d'IA) ; cette limite sert seulement à empêcher de marteler
 * le stockage avec des identifiants au hasard. Elle est large : un usage normal n'y touche pas.
 */
const LIMITE_FEEDBACK = { parHeure: 30, parJour: 100 };
const MAX_CORPS_FEEDBACK = 1_024;

/**
 * `POST /api/v1/feedback` : `{ analyse_id, vote }`.
 *
 * L'identifiant est consommé de façon atomique : le premier vote le détruit, les suivants
 * (ou un identifiant inventé, ou expiré) sont refusés sans qu'on puisse distinguer ces cas.
 * Le score vient du serveur, pas du client : impossible de fausser les agrégats en envoyant
 * un faux score. On n'enregistre qu'un compteur par (niveau, tranche de 10 points, vote).
 */
export async function traiterFeedback(request: Request, deps: DependancesApi): Promise<Response> {
  if (requeteInterSites(request.headers)) return reponseErreur("entree_invalide", { statut: 403 });

  try {
    const debit = await verifierDebit(
      deps.stockage,
      hasherIp(extraireIp(request.headers), deps.secretIp),
      LIMITE_FEEDBACK,
      deps.maintenant().getTime(),
      "feedback",
    );
    if (!debit.ok)
      return reponseErreur("trop_de_requetes", { reessayerDansS: debit.reessayerDansS });
  } catch {
    // Stockage en panne : le vote ne pourra de toute façon pas être enregistré, voir plus bas.
  }

  const corps = await lireJson(request, MAX_CORPS_FEEDBACK);
  if (!corps.ok) {
    return reponseErreur("entree_invalide", { statut: corps.raison === "trop_gros" ? 413 : 400 });
  }
  const entree = FeedbackInputSchema.safeParse(corps.valeur);
  if (!entree.success) return reponseErreur("entree_invalide");

  try {
    const enregistre = await deps.stockage.prendre(cleAnalyse(entree.data.analyse_id));
    const tranche = Number(enregistre);
    if (enregistre === null || !Number.isInteger(tranche) || tranche < 0 || tranche > 90) {
      return reponseErreur("vote_impossible");
    }
    // Les seuils de niveau sont des multiples de 10 : la tranche suffit à retrouver le niveau.
    await deps.stockage.incrementer(
      cleFeedback(niveauPourScore(tranche), tranche, entree.data.vote),
      1,
    );
  } catch {
    return reponseErreur("erreur_interne");
  }
  return reponseJson({ ok: true });
}

export interface AgregatFeedback {
  niveau: Niveau;
  tranche: number;
  up: number;
  down: number;
}

/**
 * Relit tous les agrégats du feedback, pour calibrer les seuils (un script, un tableau de
 * bord). Même chose depuis la console Upstash : clés `feedback:<niveau>:<tranche>:<vote>`.
 */
export async function lireAgregatsFeedback(stockage: Stockage): Promise<AgregatFeedback[]> {
  const tranches = Array.from({ length: 10 }, (_, i) => i * 10);
  return Promise.all(
    tranches.map(async (tranche) => {
      const niveau = niveauPourScore(tranche);
      const [up, down] = await Promise.all(
        VOTES.map(
          async (vote: Vote) => (await stockage.lire(cleFeedback(niveau, tranche, vote))) ?? 0,
        ),
      );
      return { niveau, tranche, up: up ?? 0, down: down ?? 0 };
    }),
  );
}
