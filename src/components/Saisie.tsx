"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ErreurAffichee } from "@/lib/client/api";
import { detecterLienAnnonce } from "@/lib/client/lien";
import { MAX_IMAGES, MAX_TEXT_CHARS, MAX_URL_CHARS } from "@/lib/contracts/limits";
import { fr } from "@/lib/copy/fr";
import type { Plateforme } from "@/lib/contracts/extracted";
import { MessageErreur } from "./MessageErreur";
import { SelecteurSite } from "./SelecteurSite";
import type { Capture } from "./useCaptures";

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";
const CHAMP =
  "mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 dark:border-neutral-700 dark:bg-neutral-900";

function IconeAppareilPhoto() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-9"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx={12} cy={13} r={3.5} />
    </svg>
  );
}

/**
 * Un champ qu'on remplit ne doit pas rester sous le bouton fixé en bas : « nearest » ne défile que
 * si nécessaire, et la marge réservée par `scroll-padding-bottom` tient compte de la hauteur du bouton.
 */
function ramenerAuDessusDuBouton(e: { currentTarget: HTMLElement }) {
  e.currentTarget.scrollIntoView({ block: "nearest" });
}

export interface PropsSaisie {
  site: Plateforme;
  onSite: (site: Plateforme) => void;
  captures: readonly Capture[];
  enCours: number;
  messageCaptures: string | null;
  onAjouter: (fichiers: File[]) => void;
  onRetirer: (id: string) => void;
  texte: string;
  onTexte: (valeur: string) => void;
  lien: string;
  onLien: (valeur: string) => void;
  texteOuvert: boolean;
  onBasculerTexte: () => void;
  zoneTexte: RefObject<HTMLTextAreaElement | null>;
  erreur: ErreurAffichee | null;
  onCollerTexte: () => void;
  peutEnvoyer: boolean;
  onVerifier: () => void;
}

export function Saisie({
  site,
  onSite,
  captures,
  enCours,
  messageCaptures,
  onAjouter,
  onRetirer,
  texte,
  onTexte,
  lien,
  onLien,
  texteOuvert,
  onBasculerTexte,
  zoneTexte,
  erreur,
  onCollerTexte,
  peutEnvoyer,
  onVerifier,
}: PropsSaisie) {
  const fichier = useRef<HTMLInputElement>(null);
  const [survol, setSurvol] = useState(false);
  const occupees = captures.length + enCours;
  const lienAnnonce = detecterLienAnnonce(lien);
  const barre = useRef<HTMLDivElement>(null);

  // Le bouton est fixé en bas de l'écran : on réserve sa hauteur (zone de sécurité de l'iPhone
  // comprise) sous le contenu, et pour le défilement automatique vers le champ qu'on remplit,
  // pour qu'il ne passe jamais dessous.
  useEffect(() => {
    const element = barre.current;
    if (!element) return;
    const racine = document.documentElement;
    const mesurer = () => racine.style.setProperty("--hauteur-cta", `${element.offsetHeight}px`);
    mesurer();
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(element);
    return () => {
      observateur.disconnect();
      racine.style.removeProperty("--hauteur-cta");
    };
  }, []);
  const complet = occupees >= MAX_IMAGES;

  function choisir(liste: FileList | null) {
    if (liste && liste.length > 0) onAjouter([...liste]);
  }

  return (
    <form
      className="flex flex-1 flex-col pb-[calc(var(--hauteur-cta,10rem)+1rem)]"
      onSubmit={(e) => {
        e.preventDefault();
        onVerifier();
      }}
    >
      {erreur && <MessageErreur erreur={erreur} onCollerTexte={onCollerTexte} />}

      <section aria-labelledby="titre-captures" className="mt-6">
        <h2 id="titre-captures" className="sr-only">
          {fr.ui.captures.titre}
        </h2>
        <input
          ref={fichier}
          type="file"
          // Types précis : sur iPhone, le sélecteur convertit alors les photos HEIC en JPEG.
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => {
            choisir(e.target.files);
            e.target.value = "";
          }}
        />

        {occupees === 0 ? (
          <button
            type="button"
            onClick={() => fichier.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              onAjouter([...e.dataTransfer.files]);
            }}
            className={`flex w-full flex-col items-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors ${FOCUS} ${
              survol
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                : "border-neutral-300 bg-neutral-50 hover:border-indigo-400 dark:border-neutral-700 dark:bg-neutral-900"
            }`}
          >
            <span className="text-indigo-600 dark:text-indigo-400">
              <IconeAppareilPhoto />
            </span>
            <span className="text-lg font-semibold">
              {survol ? fr.ui.captures.deposer : fr.ui.captures.ajouter}
            </span>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              {fr.ui.captures.aide}
            </span>
          </button>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {captures.map((capture, i) => (
              <li key={capture.id} className="relative aspect-3/4">
                {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), rien à optimiser */}
                <img
                  src={capture.url}
                  alt={fr.ui.captures.alt(i + 1)}
                  className="size-full rounded-2xl border border-neutral-200 object-cover dark:border-neutral-700"
                />
                <button
                  type="button"
                  onClick={() => onRetirer(capture.id)}
                  aria-label={fr.ui.captures.retirer(i + 1)}
                  className={`absolute -top-3 -right-3 flex size-11 items-center justify-center rounded-full ${FOCUS}`}
                >
                  {/* Zone tactile de 44 px, pastille visible de 28 px. */}
                  <span
                    aria-hidden="true"
                    className="flex size-7 items-center justify-center rounded-full bg-neutral-900 text-lg leading-none text-white shadow ring-2 ring-white dark:bg-white dark:text-neutral-900 dark:ring-neutral-950"
                  >
                    ×
                  </span>
                </button>
              </li>
            ))}
            {Array.from({ length: enCours }, (_, i) => (
              <li
                key={`en-cours-${i}`}
                aria-hidden="true"
                className="flex aspect-3/4 animate-pulse items-center justify-center rounded-2xl bg-neutral-200 dark:bg-neutral-800"
              />
            ))}
            {!complet && (
              <li className="aspect-3/4">
                <button
                  type="button"
                  onClick={() => fichier.current?.click()}
                  aria-label={fr.ui.captures.ajouterEncore}
                  className={`flex size-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-neutral-300 text-neutral-700 hover:border-indigo-400 dark:border-neutral-700 dark:text-neutral-300 ${FOCUS}`}
                >
                  <span aria-hidden="true" className="text-3xl leading-none">
                    +
                  </span>
                  <span className="px-1 text-xs">{fr.ui.captures.ajouterEncore}</span>
                </button>
              </li>
            )}
          </ul>
        )}

        {messageCaptures && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {messageCaptures}
          </p>
        )}
      </section>

      <section className="mt-6">
        <SelecteurSite valeur={site} onChange={onSite} />
      </section>

      <section className="mt-6">
        <button
          type="button"
          aria-expanded={texteOuvert}
          aria-controls="zone-texte"
          onClick={onBasculerTexte}
          className={`flex h-12 items-center gap-2 rounded-xl font-medium text-indigo-700 underline underline-offset-4 dark:text-indigo-300 ${FOCUS}`}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {texteOuvert ? "−" : "+"}
          </span>
          {texteOuvert ? fr.ui.texte.fermer : fr.ui.texte.ouvrir}
        </button>

        {texteOuvert && (
          <div id="zone-texte" className="mt-2 space-y-4">
            <div>
              <label htmlFor="champ-texte" className="font-medium">
                {fr.ui.texte.labelTexte}
              </label>
              <textarea
                id="champ-texte"
                ref={zoneTexte}
                value={texte}
                onChange={(e) => onTexte(e.target.value)}
                onFocus={ramenerAuDessusDuBouton}
                maxLength={MAX_TEXT_CHARS}
                rows={6}
                placeholder={fr.ui.texte.placeholderTexte}
                className={CHAMP}
              />
              {texte.length > MAX_TEXT_CHARS * 0.8 && (
                <p className="mt-1 text-right text-xs text-neutral-600 dark:text-neutral-400">
                  {texte.length.toLocaleString("fr-FR")} / {MAX_TEXT_CHARS.toLocaleString("fr-FR")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="champ-lien" className="font-medium">
                {fr.ui.texte.labelLien}
              </label>
              <input
                id="champ-lien"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={lien}
                onChange={(e) => onLien(e.target.value)}
                onFocus={ramenerAuDessusDuBouton}
                maxLength={MAX_URL_CHARS}
                placeholder={fr.ui.texte.placeholderLien}
                aria-describedby="aide-lien"
                className={CHAMP}
              />
              <div id="aide-lien" aria-live="polite">
                {lienAnnonce ? (
                  <div className="mt-2 rounded-xl border border-neutral-300 bg-neutral-100 p-3 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
                    <p className="font-semibold">{fr.lienAnnonce.titre}</p>
                    <p className="mt-0.5">
                      {fr.lienAnnonce.note(fr.lienAnnonce.sites[lienAnnonce])}
                    </p>
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">
                    {fr.ui.texte.aideLien}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <div
        ref={barre}
        className="fixed inset-x-0 bottom-0 z-10 bg-linear-to-t from-white from-70% to-transparent px-4 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:from-neutral-950"
      >
        <div className="mx-auto max-w-lg">
          {!peutEnvoyer && enCours === 0 && (
            <p
              id="aide-cta"
              className="mb-1.5 text-center text-sm text-neutral-600 dark:text-neutral-400"
            >
              {fr.ui.ctaAide}
            </p>
          )}
          <button
            type="submit"
            disabled={!peutEnvoyer}
            aria-describedby={peutEnvoyer ? undefined : "aide-cta"}
            className={`h-14 w-full rounded-2xl bg-indigo-600 text-lg font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-600 disabled:shadow-none dark:bg-indigo-500 dark:hover:bg-indigo-400 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400 ${FOCUS}`}
          >
            {enCours > 0 ? fr.ui.ctaTraitement : fr.ui.cta}
          </button>
          <p className="mt-2 text-center text-xs text-neutral-600 dark:text-neutral-400">
            {fr.ui.confidentialite}
          </p>
        </div>
      </div>
    </form>
  );
}
