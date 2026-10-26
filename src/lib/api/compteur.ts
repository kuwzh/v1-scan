import type { Stockage } from "../security";
import { CLE_COMPTEUR } from "./cles";
import { reponseJson } from "./reponses";

export type LecteurCompteur = () => Promise<number | null>;

/**
 * Lecteur du compteur public avec cache : le compteur n'est pas relu à chaque visite mais au
 * plus une fois par `ttlMs` et par instance. Les lectures simultanées partagent un seul
 * appel. Si le stockage est injoignable, on garde la dernière valeur connue (sinon `null` :
 * la page n'affiche alors pas de nombre plutôt qu'un nombre inventé).
 */
export function creerLecteurCompteur(
  stockage: Stockage,
  ttlMs: number,
  maintenant: () => number = Date.now,
): LecteurCompteur {
  let valeur: number | null = null;
  let lueA = Number.NEGATIVE_INFINITY;
  let enCours: Promise<number | null> | null = null;

  return () => {
    if (maintenant() - lueA < ttlMs) return Promise.resolve(valeur);
    enCours ??= stockage
      .lire(CLE_COMPTEUR)
      .then((v) => {
        valeur = v ?? 0;
        return valeur;
      })
      .catch(() => valeur)
      .finally(() => {
        lueA = maintenant();
        enCours = null;
      });
    return enCours;
  };
}

/** Un lien de plus dans le compteur. Sans effet sur l'analyse si le stockage est en panne. */
export async function compterAnalyse(stockage: Stockage): Promise<void> {
  try {
    await stockage.incrementer(CLE_COMPTEUR, 1);
  } catch {
    // Le compteur est cosmétique : jamais une raison de faire échouer une analyse.
  }
}

/** `GET /api/v1/stats`. Mis en cache par le CDN pour la même durée que le lecteur. */
export async function traiterStats(
  lireCompteur: LecteurCompteur,
  cacheS: number,
): Promise<Response> {
  const analyses = await lireCompteur();
  return reponseJson(
    { analyses },
    {
      headers: {
        "cache-control":
          analyses === null
            ? "public, s-maxage=30"
            : `public, s-maxage=${cacheS}, stale-while-revalidate=${cacheS * 2}`,
      },
    },
  );
}
