"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { envoyerAnalyse } from "@/lib/client/api";
import { VUE_INITIALE, reduire } from "@/lib/client/etat";
import { APP_NAME } from "@/lib/config";
import { fr } from "@/lib/copy/fr";
import { Chargement } from "./Chargement";
import { Resultat } from "./Resultat";
import { Saisie } from "./Saisie";
import { useCaptures } from "./useCaptures";

/** Les trois écrans (saisie, chargement, résultat) et ce qui les relie. */
export function Verificateur() {
  const [vue, dispatch] = useReducer(reduire, VUE_INITIALE);
  const { captures, enCours, message, ajouter, retirer, vider } = useCaptures();
  const [texte, setTexte] = useState("");
  const [lien, setLien] = useState("");
  const [texteOuvert, setTexteOuvert] = useState(false);
  const numeroEnvoi = useRef(0);
  const controleur = useRef<AbortController | null>(null);
  const zoneTexte = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => controleur.current?.abort(), []);

  const peutEnvoyer =
    enCours === 0 && (captures.length > 0 || texte.trim() !== "" || lien.trim() !== "");

  async function verifier() {
    if (!peutEnvoyer) return;
    const id = ++numeroEnvoi.current;
    const appel = new AbortController();
    controleur.current = appel;
    dispatch({ type: "envoyer", id });
    const r = await envoyerAnalyse(
      { images: captures.map((c) => c.blob), texte, lien },
      { signal: appel.signal },
    );
    if (r.ok) dispatch({ type: "reussi", id, reponse: r.reponse });
    else if (!r.annule) dispatch({ type: "echec", id, erreur: r.erreur });
  }

  function annuler() {
    controleur.current?.abort();
    dispatch({ type: "annuler", id: numeroEnvoi.current });
  }

  function recommencer() {
    vider();
    setTexte("");
    setLien("");
    setTexteOuvert(false);
    dispatch({ type: "recommencer" });
  }

  function collerTexte() {
    setTexteOuvert(true);
    dispatch({ type: "effacerErreur" });
    // Le champ n'existe pas encore : on attend le rendu suivant.
    requestAnimationFrame(() => zoneTexte.current?.focus());
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
      {vue.nom === "saisie" && (
        <>
          <header>
            <p className="text-sm font-semibold tracking-widest text-indigo-700 uppercase dark:text-indigo-300">
              {APP_NAME}
            </p>
            <h1 className="mt-2 text-3xl leading-tight font-bold text-balance">{fr.ui.tagline}</h1>
            <p className="mt-2 text-neutral-600 dark:text-neutral-400">{fr.ui.plateformes}</p>
          </header>
          <Saisie
            captures={captures}
            enCours={enCours}
            messageCaptures={message}
            onAjouter={(fichiers) => void ajouter(fichiers)}
            onRetirer={retirer}
            texte={texte}
            onTexte={setTexte}
            lien={lien}
            onLien={setLien}
            texteOuvert={texteOuvert}
            onBasculerTexte={() => setTexteOuvert((o) => !o)}
            zoneTexte={zoneTexte}
            erreur={vue.erreur}
            onCollerTexte={collerTexte}
            peutEnvoyer={peutEnvoyer}
            onVerifier={() => void verifier()}
          />
        </>
      )}
      {vue.nom === "envoi" && <Chargement onAnnuler={annuler} />}
      {vue.nom === "resultat" && (
        <div className="pb-10">
          <Resultat reponse={vue.reponse} onRecommencer={recommencer} />
        </div>
      )}
      <noscript>
        <p className="mt-6 rounded-2xl bg-neutral-100 p-4">{fr.ui.sansJavascript}</p>
      </noscript>
    </main>
  );
}
