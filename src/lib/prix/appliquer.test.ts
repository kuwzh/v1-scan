import { describe, expect, it } from "vitest";
import type { PrixResponse } from "../contracts/prix";
import type { AnalysisResult } from "../contracts/result";
import { GRAVITES, rangGravite } from "../contracts/signals";
import { donneesExtraitesVides } from "../contracts/extracted";
import { fr } from "../copy/fr";
import { RANG_GRAVITE, appliquerPrix } from "./appliquer";

const signal = (
  id: string,
  gravite: AnalysisResult["signaux"][number]["gravite"],
  source = "regle" as const,
) => ({
  id,
  label: `Signal ${id}`,
  gravite,
  source,
});

const resultat = (partiel: Partial<AnalysisResult> = {}): AnalysisResult => ({
  score: 20,
  niveau: "faible",
  signaux: [signal("a", "attention"), signal("ia.1", "attention", "ia" as never)],
  rassurants: [],
  conseils: ["Reste sur la plateforme."],
  donnees_extraites: donneesExtraitesVides(),
  meta: { mode: "complet", score_regles: 10, score_ia: 20, plancher: null },
  ...partiel,
});

const prix = (partiel: Partial<PrixResponse> = {}): PrixResponse => ({
  statut: "ok",
  estimation: null,
  comparaison: null,
  signal: null,
  resultat: { score: 20, niveau: "faible", signaux_retires: [] },
  depuis_cache: false,
  ...partiel,
});

describe("RANG_GRAVITE", () => {
  it("reprend l'ordre des contrats", () => {
    for (const g of GRAVITES) expect(RANG_GRAVITE[g]).toBe(rangGravite(g));
  });
});

describe("appliquerPrix", () => {
  it("ne change rien (même objet) quand la comparaison n'apporte rien", () => {
    const avant = resultat();
    expect(appliquerPrix(avant, prix())).toBe(avant);
  });

  it("met à jour le score et le niveau", () => {
    const r = appliquerPrix(
      resultat(),
      prix({ resultat: { score: 41, niveau: "moyen", signaux_retires: [] } }),
    );
    expect(r).toMatchObject({ score: 41, niveau: "moyen" });
  });

  it("ajoute le signal de prix dans l'ordre de gravité, et son conseil", () => {
    const r = appliquerPrix(
      resultat(),
      prix({
        signal: signal("prix.web", "importante"),
        resultat: { score: 41, niveau: "moyen", signaux_retires: [] },
      }),
    );
    expect(r.signaux.map((s) => s.id)).toEqual(["prix.web", "a", "ia.1"]);
    expect(r.conseils).toEqual(["Reste sur la plateforme.", fr.conseilsRegles.prixBas]);
  });

  it("à gravité égale, le signal d'une règle passe avant celui de l'IA", () => {
    const r = appliquerPrix(
      resultat(),
      prix({
        signal: signal("prix.web", "attention"),
        resultat: { score: 30, niveau: "moyen", signaux_retires: [] },
      }),
    );
    expect(r.signaux.map((s) => s.id)).toEqual(["a", "prix.web", "ia.1"]);
  });

  it("retire le signal de la table de prix qu'il remplace", () => {
    const avant = resultat({
      signaux: [signal("prix.bas", "attention"), signal("a", "attention")],
      conseils: [fr.conseilsRegles.prixBas],
    });
    const r = appliquerPrix(
      avant,
      prix({
        signal: signal("prix.web", "importante"),
        resultat: { score: 38, niveau: "moyen", signaux_retires: ["prix.bas"] },
      }),
    );
    expect(r.signaux.map((s) => s.id)).toEqual(["prix.web", "a"]);
    // Le conseil n'est pas ajouté deux fois.
    expect(r.conseils).toEqual([fr.conseilsRegles.prixBas]);
  });

  it("n'ajoute pas de conseil au-delà de la limite", () => {
    const cinq = ["1", "2", "3", "4", "5"];
    const r = appliquerPrix(
      resultat({ conseils: cinq }),
      prix({
        signal: signal("prix.web", "importante"),
        resultat: { score: 41, niveau: "moyen", signaux_retires: [] },
      }),
    );
    expect(r.conseils).toEqual(cinq);
  });

  it("ne duplique pas un signal déjà présent (comparaison relancée)", () => {
    const avant = resultat({
      signaux: [signal("prix.web", "importante")],
      score: 41,
      niveau: "moyen",
    });
    const r = appliquerPrix(
      avant,
      prix({
        signal: signal("prix.web", "importante"),
        resultat: { score: 41, niveau: "moyen", signaux_retires: [] },
      }),
    );
    expect(r).toBe(avant);
  });

  it("ne modifie jamais le résultat de départ", () => {
    const avant = resultat();
    const copie = structuredClone(avant);
    appliquerPrix(
      avant,
      prix({
        signal: signal("prix.web", "importante"),
        resultat: { score: 41, niveau: "moyen", signaux_retires: ["a"] },
      }),
    );
    expect(avant).toEqual(copie);
  });
});
