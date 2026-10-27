"use client";

import { useEffect, useRef, useState } from "react";
import { comparerPrix } from "@/lib/client/api";
import type { PrixResponse } from "@/lib/contracts/prix";
import { fr } from "@/lib/copy/fr";

const BOUTON =
  "inline-flex h-12 w-full items-center justify-center rounded-xl border border-indigo-600 px-5 text-base font-semibold text-indigo-700 transition-colors hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 dark:border-indigo-400 dark:text-indigo-300 dark:hover:bg-indigo-950/60";

const CARTE =
  "mt-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";

/** Hôte lisible d'une adresse https, ou `null` si ce n'en est pas une. */
function hoteHttps(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
}

function Sources({ sources }: { sources: NonNullable<PrixResponse["estimation"]>["sources"] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold">{fr.prix.sources}</h3>
      <ul className="mt-1.5 space-y-1 text-sm">
        {sources.map((source) => {
          const hote = hoteHttps(source.url);
          const nom = source.titre || hote || source.url;
          return (
            <li key={source.url} className="[overflow-wrap:anywhere]">
              {hote ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-100"
                >
                  {nom}
                </a>
              ) : (
                <span>{nom}</span>
              )}
              {hote && <span className="text-neutral-600 dark:text-neutral-400"> · {hote}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChiffresPrix({ prix }: { prix: PrixResponse }) {
  const { estimation, comparaison } = prix;
  return (
    <div className={CARTE}>
      <p className="inline-block rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-semibold text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100">
        {fr.prix.estimation}
      </p>

      {prix.statut === "introuvable" && (
        <p className="mt-3 text-neutral-800 dark:text-neutral-200">{fr.prix.introuvable}</p>
      )}

      {estimation?.prix_neuf_eur != null && (
        <p className="mt-3">{fr.prix.neuf(estimation.prix_neuf_eur)}</p>
      )}
      {estimation?.occasion_min_eur != null && estimation.occasion_max_eur != null && (
        <p className="mt-1">
          {fr.prix.occasion(estimation.occasion_min_eur, estimation.occasion_max_eur)}
        </p>
      )}
      {comparaison && (
        <p className="mt-3 text-lg leading-snug font-semibold">
          {fr.prix.ecart(comparaison.ecart_pct, comparaison.prix_annonce_eur)}
        </p>
      )}

      {estimation && (
        <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
          {fr.prix.confiance[estimation.confiance]}
          {comparaison && !comparaison.fiable && ` — ${fr.prix.peuFiable}`}
        </p>
      )}
      {prix.signal && (
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          {fr.prix.scoreMisAJour}
          {prix.resultat.signaux_retires.length > 0 && ` ${fr.prix.ancienSignal}`}
        </p>
      )}
      {estimation && (
        <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
          {fr.prix.article(estimation.article)}
          {estimation.remarque && ` — ${estimation.remarque}`}
        </p>
      )}
      {estimation && <Sources sources={estimation.sources} />}

      <p className="mt-4 text-sm text-neutral-700 dark:text-neutral-300">{fr.prix.mention}</p>
      {prix.depuis_cache && (
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{fr.prix.depuisCache}</p>
      )}
    </div>
  );
}

type Etat = "attente" | "recherche" | "erreur";

/**
 * Carte « Prix » du résultat : un bouton qui lance la recherche (payante, donc jamais
 * automatique), puis les chiffres, l'écart, les sources et la mention « estimation ». La réponse
 * est remontée (`onPrix`) pour mettre à jour le score et les signaux affichés.
 */
export function CartePrix({
  analyseId,
  prix,
  onPrix,
}: {
  analyseId: string;
  prix: PrixResponse | null;
  onPrix: (reponse: PrixResponse) => void;
}) {
  const [etat, setEtat] = useState<Etat>("attente");
  const [erreur, setErreur] = useState<string | null>(null);
  const appelEnCours = useRef<AbortController | null>(null);
  useEffect(() => () => appelEnCours.current?.abort(), []);

  async function lancer() {
    appelEnCours.current?.abort();
    const appel = new AbortController();
    appelEnCours.current = appel;
    setEtat("recherche");
    setErreur(null);
    const r = await comparerPrix(analyseId, { signal: appel.signal });
    if (appel.signal.aborted) return;
    if (r.ok) {
      onPrix(r.reponse);
      setEtat("attente");
    } else if (!r.annule) {
      setErreur(r.erreur.message);
      setEtat("erreur");
    }
  }

  return (
    <section className="mt-8" aria-labelledby="titre-prix">
      <h2 id="titre-prix" className="text-lg font-semibold">
        {fr.prix.titre}
      </h2>
      {prix ? (
        <ChiffresPrix prix={prix} />
      ) : (
        <div className={CARTE}>
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{fr.prix.aide}</p>
          <button
            type="button"
            className={`${BOUTON} mt-3`}
            disabled={etat === "recherche"}
            aria-describedby={etat === "erreur" ? "erreur-prix" : undefined}
            onClick={() => void lancer()}
          >
            {etat === "recherche" ? fr.prix.enCours : fr.prix.bouton}
          </button>
          <div aria-live="polite">
            {etat === "recherche" && (
              <div
                aria-hidden="true"
                className="mx-auto mt-4 size-6 animate-spin rounded-full border-2 border-neutral-200 border-t-indigo-600 motion-reduce:animate-pulse dark:border-neutral-800 dark:border-t-indigo-400"
              />
            )}
            {etat === "erreur" && erreur && (
              <p
                id="erreur-prix"
                role="alert"
                className="mt-3 text-sm text-red-700 dark:text-red-300"
              >
                <span className="font-semibold">{fr.prix.erreur}.</span> {erreur}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
