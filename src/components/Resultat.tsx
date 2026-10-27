"use client";

import { useEffect, useRef } from "react";
import type { AnalyzeResponse } from "@/lib/contracts/api";
import type { Niveau } from "@/lib/contracts/niveau";
import type { Gravite } from "@/lib/contracts/signals";
import { fr } from "@/lib/copy/fr";
import { Feedback } from "./Feedback";
import { Jauge } from "./Jauge";

const CARTE_NIVEAU: Record<Niveau, string> = {
  faible: "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50",
  moyen: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50",
  élevé: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/50",
};

const PASTILLE_GRAVITE: Record<Gravite, string> = {
  info: "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100",
  attention: "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100",
  importante: "bg-orange-200 text-orange-950 dark:bg-orange-900 dark:text-orange-100",
  critique: "bg-red-200 text-red-950 dark:bg-red-900 dark:text-red-100",
};

const BORD_GRAVITE: Record<Gravite, string> = {
  info: "border-l-neutral-400",
  attention: "border-l-amber-500",
  importante: "border-l-orange-500",
  critique: "border-l-red-600",
};

function Section({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{titre}</h2>
      {children}
    </section>
  );
}

export function Resultat({
  reponse,
  onRecommencer,
}: {
  reponse: AnalyzeResponse;
  onRecommencer: () => void;
}) {
  const { resultat, partielle } = reponse;
  const titre = useRef<HTMLHeadingElement>(null);
  // Les lecteurs d'écran annoncent le résultat dès qu'il apparaît.
  useEffect(() => {
    titre.current?.focus();
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div>
      <div className={`rounded-3xl border p-5 pt-6 ${CARTE_NIVEAU[resultat.niveau]}`}>
        <Jauge score={resultat.score} niveau={resultat.niveau} />
        <h1 ref={titre} tabIndex={-1} className="mt-4 text-center text-2xl font-bold outline-none">
          {fr.niveaux[resultat.niveau].titre}
        </h1>
        <p className="mt-1 text-center text-neutral-800 dark:text-neutral-200">
          {fr.niveaux[resultat.niveau].resume}
        </p>
      </div>

      {partielle && (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-neutral-300 bg-neutral-100 p-4 text-sm text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
        >
          {partielle.message}
        </p>
      )}

      <Section titre={fr.sections.signaux}>
        {resultat.signaux.length === 0 ? (
          <p className="mt-3 text-neutral-700 dark:text-neutral-300">{fr.aucunSignal}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {resultat.signaux.map((signal) => (
              <li
                key={signal.id}
                className={`rounded-xl border border-l-4 border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 ${BORD_GRAVITE[signal.gravite]}`}
              >
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${PASTILLE_GRAVITE[signal.gravite]}`}
                >
                  {fr.gravites[signal.gravite]}
                </span>
                <p className="mt-1.5">{signal.label}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {resultat.rassurants.length > 0 && (
        <Section titre={fr.sections.rassurants}>
          <ul className="mt-3 space-y-2">
            {resultat.rassurants.map((rassurant) => (
              <li key={rassurant.id} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white"
                >
                  ✓
                </span>
                <span>{rassurant.label}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {resultat.conseils.length > 0 && (
        <Section titre={fr.sections.conseils}>
          <ol className="mt-3 list-decimal space-y-2 pl-5 marker:font-semibold">
            {resultat.conseils.map((conseil) => (
              <li key={conseil} className="pl-1">
                {conseil}
              </li>
            ))}
          </ol>
        </Section>
      )}

      <p className="mt-8 rounded-2xl bg-neutral-100 p-4 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        {fr.disclaimer}
      </p>

      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <Feedback analyseId={reponse.analyse_id} />
      </div>

      <button
        type="button"
        onClick={onRecommencer}
        className="mt-8 h-14 w-full rounded-2xl bg-indigo-600 text-lg font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-400"
      >
        {fr.ui.resultat.recommencer}
      </button>
    </div>
  );
}
