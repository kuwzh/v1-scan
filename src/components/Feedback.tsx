"use client";

import { useState } from "react";
import { envoyerVote } from "@/lib/client/api";
import type { Vote } from "@/lib/contracts/feedback";
import { fr } from "@/lib/copy/fr";

type Etat = "attente" | "envoi" | "merci" | "echec";

const BOUTON =
  "inline-flex h-12 min-w-28 items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white px-5 text-base font-medium transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800";

/** « Ce résultat était-il juste ? » : un vote par analyse, sans aucun contenu envoyé. */
export function Feedback({ analyseId }: { analyseId: string }) {
  const [etat, setEtat] = useState<Etat>("attente");

  async function voter(vote: Vote) {
    setEtat("envoi");
    // « Déjà voté » ou « trop ancien » : pour la personne, c'est un merci aussi.
    setEtat((await envoyerVote(analyseId, vote)) === "echec" ? "echec" : "merci");
  }

  if (etat === "merci") {
    return (
      <p role="status" className="text-neutral-700 dark:text-neutral-300">
        {fr.feedback.merci}
      </p>
    );
  }

  return (
    <div>
      <p id="feedback-question" className="font-medium">
        {fr.feedback.question}
      </p>
      <div role="group" aria-labelledby="feedback-question" className="mt-3 flex gap-3">
        <button
          type="button"
          className={BOUTON}
          disabled={etat === "envoi"}
          onClick={() => voter("up")}
        >
          <span aria-hidden="true">👍</span> {fr.feedback.oui}
        </button>
        <button
          type="button"
          className={BOUTON}
          disabled={etat === "envoi"}
          onClick={() => voter("down")}
        >
          <span aria-hidden="true">👎</span> {fr.feedback.non}
        </button>
      </div>
      {etat === "echec" && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {fr.ui.feedbackEchec}
        </p>
      )}
    </div>
  );
}
