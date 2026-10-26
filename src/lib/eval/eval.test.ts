import { describe, expect, it } from "vitest";
import { estimerCout } from "../ai/tarifs";
import type { SuiviIa } from "../analyze/pipeline";
import {
  completerConfiance,
  creerMessage,
  donneesExtraitesVides,
  type ExtractedData,
} from "../contracts/extracted";
import type { Niveau } from "../contracts/niveau";
import type { AnalysisResult } from "../contracts/result";
import type { Signal } from "../contracts/signals";
import {
  comparerAuteurs,
  comparerExtraction,
  calculerExtraction,
  messagesInventes,
} from "./extraction";
import { calculerDetection, calculerFauxPositifs, intervalleWilson, percentile } from "./metriques";
import { SEUILS_PAR_DEFAUT, agreger, evaluerPortes, formaterRapport } from "./rapport";
import type { CasEval, SortieCas } from "./types";

function cas(
  id: string,
  categorie: "sain" | "suspect",
  groupe: string,
  extra: Partial<CasEval> = {},
): CasEval {
  return {
    id,
    categorie,
    groupe,
    description: `cas ${id}`,
    entree: { texte: "x" },
    attendu: {},
    ...extra,
  };
}

interface OptionsSortie {
  niveau: Niveau;
  score: number;
  scoreRegles?: number;
  scoreIa?: number | null;
  signaux?: Signal[];
  donnees?: ExtractedData;
}
function sortie(c: CasEval, o: OptionsSortie, ia?: SuiviIa): SortieCas {
  const resultat = {
    score: o.score,
    niveau: o.niveau,
    signaux: o.signaux ?? [],
    rassurants: [],
    conseils: [],
    donnees_extraites: o.donnees ?? donneesExtraitesVides(),
    meta: {
      mode: o.scoreIa === null ? "regles_seules" : "complet",
      score_regles: o.scoreRegles ?? 0,
      score_ia: o.scoreIa === undefined ? 0 : o.scoreIa,
      plancher: null,
    },
  } as AnalysisResult;
  return { cas: c, repetition: 0, statut: "analyse", resultat, ...(ia ? { ia } : {}) };
}
const erreur = (c: CasEval): SortieCas => ({
  cas: c,
  repetition: 0,
  statut: "erreur",
  erreur: "ia_indisponible",
});
const signal = (
  id: string,
  gravite: Signal["gravite"],
  source: Signal["source"] = "regle",
): Signal => ({
  id,
  label: `libellé ${id}`,
  gravite,
  source,
});

describe("intervalleWilson", () => {
  it("0 sur 24 : la borne haute rappelle qu'on ne peut pas conclure « 0 % »", () => {
    const { bas, haut } = intervalleWilson(0, 24);
    expect(bas).toBe(0);
    expect(haut).toBeCloseTo(0.138, 2);
  });

  it("24 sur 24 est le miroir", () => {
    const { bas, haut } = intervalleWilson(24, 24);
    expect(bas).toBeCloseTo(0.862, 2);
    expect(haut).toBe(1);
  });

  it("5 sur 10, et n = 0", () => {
    const { bas, haut } = intervalleWilson(5, 10);
    expect(bas).toBeCloseTo(0.237, 2);
    expect(haut).toBeCloseTo(0.763, 2);
    expect(intervalleWilson(0, 0)).toEqual({ bas: 0, haut: 1 });
  });

  it("se resserre avec plus de cas", () => {
    expect(intervalleWilson(0, 200).haut).toBeLessThan(intervalleWilson(0, 24).haut / 4);
  });
});

describe("percentile", () => {
  it("médiane et p95", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(
      percentile(
        Array.from({ length: 100 }, (_, i) => i + 1),
        95,
      ),
    ).toBe(95);
    expect(percentile([], 50)).toBeNull();
  });
});

describe("calculerFauxPositifs", () => {
  const a = cas("a", "sain", "ordinaire");
  const b = cas("b", "sain", "ordinaire");
  const c = cas("c", "sain", "piege");
  const d = cas("d", "sain", "piege");
  const e = cas("e", "sain", "piege");
  const s = cas("s", "suspect", "critique");

  it("compte les alertes à tort, séparément des alertes fortes et critiques", () => {
    const r = calculerFauxPositifs([
      sortie(a, { niveau: "faible", score: 4 }),
      sortie(b, { niveau: "faible", score: 12 }),
      sortie(c, { niveau: "moyen", score: 35, scoreRegles: 20, scoreIa: 50 }),
      sortie(d, {
        niveau: "élevé",
        score: 70,
        scoreRegles: 70,
        scoreIa: 10,
        signaux: [signal("paiement.code_sms", "critique")],
      }),
      sortie(e, { niveau: "faible", score: 20 }),
      sortie(s, { niveau: "élevé", score: 90 }),
    ]);
    expect(r.analyses).toBe(5); // le cas suspect n'est pas compté
    expect(r.alerte).toMatchObject({ k: 2, n: 5 });
    expect(r.severe).toMatchObject({ k: 1, n: 5 });
    expect(r.critique).toMatchObject({ k: 1, n: 5 });
    expect(r.cas.map((x) => x.id).sort()).toEqual(["c", "d"]);
  });

  it("une erreur d'analyse n'est ni un succès ni un faux positif : hors du dénominateur", () => {
    const r = calculerFauxPositifs([sortie(a, { niveau: "faible", score: 3 }), erreur(b)]);
    expect(r.analyses).toBe(1);
    expect(r.erreurs).toBe(1);
    expect(r.alerte.n).toBe(1);
  });

  it("détaille par groupe", () => {
    const r = calculerFauxPositifs([
      sortie(a, { niveau: "faible", score: 3 }),
      sortie(c, { niveau: "moyen", score: 40 }),
      sortie(d, { niveau: "faible", score: 5 }),
    ]);
    expect(r.parGroupe.ordinaire?.alerte).toMatchObject({ k: 0, n: 1 });
    expect(r.parGroupe.piege?.alerte).toMatchObject({ k: 1, n: 2 });
  });

  it("dit d'où vient l'alerte : règles, IA, les deux, ou combinaison", () => {
    const r = calculerFauxPositifs([
      sortie(a, { niveau: "moyen", score: 40, scoreRegles: 45, scoreIa: 5 }),
      sortie(b, { niveau: "moyen", score: 40, scoreRegles: 5, scoreIa: 45 }),
      sortie(c, { niveau: "moyen", score: 40, scoreRegles: 40, scoreIa: 40 }),
      sortie(d, { niveau: "moyen", score: 30, scoreRegles: 25, scoreIa: 25 }),
      sortie(e, { niveau: "moyen", score: 40, scoreRegles: 40, scoreIa: null }),
    ]);
    expect(r.parOrigine).toEqual({ regles: 2, ia: 1, les_deux: 1, fusion: 1 });
  });

  it("un signal critique de l'IA ne compte pas comme critique de règle", () => {
    const r = calculerFauxPositifs([
      sortie(a, { niveau: "faible", score: 10, signaux: [signal("ia.1", "importante", "ia")] }),
    ]);
    expect(r.critique.k).toBe(0);
  });

  it("sans cas sain analysé, aucune conclusion", () => {
    expect(calculerFauxPositifs([]).alerte).toMatchObject({ k: 0, n: 0, taux: 0 });
  });
});

describe("calculerDetection", () => {
  const s1 = cas("s1", "suspect", "critique", { attendu: { niveauMin: "élevé" } });
  const s2 = cas("s2", "suspect", "critique", { attendu: { niveauMin: "élevé" } });
  const s3 = cas("s3", "suspect", "moyen", { attendu: { niveauMin: "moyen" } });

  it("mesure le niveau atteint par rapport au niveau attendu", () => {
    const r = calculerDetection([
      sortie(s1, { niveau: "élevé", score: 90 }),
      sortie(s2, { niveau: "moyen", score: 45 }),
      sortie(s3, { niveau: "élevé", score: 80 }),
    ]);
    expect(r.detectes).toMatchObject({ k: 2, n: 3 });
    expect(r.eleves).toMatchObject({ k: 1, n: 2 });
    expect(r.manques).toEqual([
      { id: "s2", groupe: "critique", attendu: "élevé", obtenu: "moyen", score: 45 },
    ]);
    expect(r.parGroupe.moyen).toMatchObject({ k: 1, n: 1 });
  });
});

describe("comparerExtraction", () => {
  const donnees = (): ExtractedData => {
    const d = donneesExtraitesVides();
    d.annonce.titre = "Sac Louis Vuitton Speedy 30";
    d.annonce.prix_eur = 25;
    d.vendeur.nombre_avis = 87;
    d.vendeur.anciennete_jours = 1200;
    return completerConfiance(d, "haute");
  };

  it("distingue correct, faux, manquant, invention et correct_null", () => {
    const lignes = comparerExtraction(
      {
        annonce: {
          titre: "louis vuitton",
          prix_eur: 30,
          marque: "Louis Vuitton",
          nombre_photos: null,
        },
        vendeur: { nombre_avis: null, anciennete_jours: { valeur: 1188, tolerance: 60 } },
      },
      donnees(),
    );
    const issue = (champ: string) => lignes.find((l) => l.champ === champ)?.issue;
    expect(issue("annonce.titre")).toBe("correct");
    expect(issue("annonce.prix_eur")).toBe("faux");
    expect(issue("annonce.marque")).toBe("manquant");
    expect(issue("annonce.nombre_photos")).toBe("correct_null");
    expect(issue("vendeur.nombre_avis")).toBe("invention"); // attendu null, obtenu 87
    expect(issue("vendeur.anciennete_jours")).toBe("correct");
  });

  it("applique la tolérance de l'ancienneté", () => {
    const d = donnees();
    d.vendeur.anciennete_jours = 1300;
    const lignes = comparerExtraction(
      { vendeur: { anciennete_jours: { valeur: 1188, tolerance: 60 } } },
      d,
    );
    expect(lignes[0]?.issue).toBe("faux");
  });

  it("ignore les champs non précisés", () => {
    expect(comparerExtraction({}, donnees())).toEqual([]);
  });
});

describe("comparerAuteurs", () => {
  const d = donneesExtraitesVides();
  d.messages = [
    creerMessage("vendeur", "Oui il est dispo !"),
    creerMessage("vendeur", "Tu peux payer via l'appli"),
    creerMessage("inconnu", "Ok merci"),
  ];

  it("compare l'auteur attendu à celui attribué", () => {
    const r = comparerAuteurs(
      [
        { contient: "il est dispo", auteur: "vendeur" },
        { contient: "payer via l'appli", auteur: "acheteur" },
        { contient: "message absent", auteur: "vendeur" },
      ],
      d,
    );
    expect(r.map((x) => x.issue)).toEqual(["correct", "faux", "manquant"]);
  });

  it("repère les messages inventés", () => {
    expect(messagesInventes(["whatsapp", "ok merci"], d)).toEqual(["ok merci"]);
  });
});

describe("calculerExtraction", () => {
  it("calcule invention, exactitude, calibration et erreurs d'attribution", () => {
    const d = donneesExtraitesVides();
    d.vendeur.nombre_avis = 40; // attendu null : invention
    d.vendeur.anciennete_jours = 100; // attendu 4 : faux
    d.annonce.prix_eur = 25; // attendu 25 : correct
    d.messages = [
      creerMessage("vendeur", "Bonjour tu es là"),
      creerMessage("vendeur", "Oui je suis là"),
      creerMessage("acheteur", "Ça marche"),
    ];
    const donnees = completerConfiance(d, "haute");
    donnees.confiance.vendeur.nombre_avis = "basse";
    const c = cas("img", "sain", "image", {
      attendu: {
        extraction: {
          annonce: { prix_eur: 25 },
          vendeur: { nombre_avis: null, anciennete_jours: { valeur: 4, tolerance: 2 } },
          messages: [
            { contient: "bonjour tu es là", auteur: "acheteur" }, // acheteur pris pour le vendeur
            { contient: "oui je suis là", auteur: "vendeur" },
            { contient: "ça marche", auteur: "inconnu" }, // deviné
          ],
        },
      },
    });
    const r = calculerExtraction([sortie(c, { niveau: "faible", score: 0, donnees })]);
    expect(r.exactitude).toMatchObject({ k: 1, n: 2 });
    expect(r.invention).toMatchObject({ k: 1, n: 1 });
    expect(r.inventionsIgnoreesParLesRegles).toEqual({ k: 1, sur: 1 });
    expect(r.fauxConfiantes).toEqual({ k: 1, sur: 2 });
    expect(r.calibration.haute).toMatchObject({ k: 1, n: 2 });
    expect(r.auteurs.acheteurPrisPourVendeur).toBe(1);
    expect(r.auteurs.devine).toBe(1);
    expect(r.auteurs.total).toMatchObject({ k: 1, n: 3 });
  });
});

describe("calculerExtraction : sans IA, rien à juger", () => {
  const c = cas("t", "sain", "ordinaire", {
    attendu: { extraction: { annonce: { prix_eur: 25 } } },
  });
  const donnees = completerConfiance(
    Object.assign(donneesExtraitesVides(), {
      annonce: { ...donneesExtraitesVides().annonce, prix_eur: 25 },
    }),
    "haute",
  );

  it("ignore les cas où l'IA n'a pas tourné ou a échoué", () => {
    const absente: SuiviIa = { statut: "absente", motif: "non_configuree" };
    const echec: SuiviIa = { statut: "echec", raison: "delai", dureeMs: 100 };
    expect(calculerExtraction([sortie(c, { niveau: "faible", score: 0 }, absente)]).cas).toBe(0);
    expect(calculerExtraction([sortie(c, { niveau: "faible", score: 0 }, echec)]).cas).toBe(0);
  });

  it("compte ceux où l'IA a répondu", () => {
    const ok: SuiviIa = {
      statut: "ok",
      modele: "claude-haiku-5-5",
      dureeMs: 100,
      usage: { entree: 1, sortie: 1, cacheLecture: 0, cacheEcriture: 0 },
      avertissements: { messagesEcartes: 0, liensEcartes: 0, valeursInvalides: [] },
    };
    const r = calculerExtraction([sortie(c, { niveau: "faible", score: 0, donnees }, ok)]);
    expect(r.cas).toBe(1);
    expect(r.exactitude).toMatchObject({ k: 1, n: 1 });
  });
});

describe("portes et rapport", () => {
  const sains = Array.from({ length: 10 }, (_, i) => cas(`s${i}`, "sain", "ordinaire"));
  const bons = sains.map((c) => sortie(c, { niveau: "faible", score: 5 }));

  it("évalue les portes avec les seuils par défaut", () => {
    const fp = calculerFauxPositifs(bons);
    const portes = evaluerPortes(
      fp,
      calculerDetection([]),
      calculerExtraction([]),
      SEUILS_PAR_DEFAUT,
    );
    expect(portes.filter((p) => p.principale).every((p) => p.ok)).toBe(true);
  });

  it("échoue quand le taux de faux positifs dépasse l'objectif ou qu'un faux positif sévère existe", () => {
    const un = [...bons.slice(1), sortie(sains[0]!, { niveau: "moyen", score: 40 })];
    expect(
      evaluerPortes(
        calculerFauxPositifs(un),
        calculerDetection([]),
        calculerExtraction([]),
        SEUILS_PAR_DEFAUT,
      )[0]?.ok,
    ).toBe(true); // 10 % : à la limite
    const deux = [
      ...bons.slice(2),
      sortie(sains[0]!, { niveau: "moyen", score: 40 }),
      sortie(sains[1]!, { niveau: "moyen", score: 40 }),
    ];
    expect(
      evaluerPortes(
        calculerFauxPositifs(deux),
        calculerDetection([]),
        calculerExtraction([]),
        SEUILS_PAR_DEFAUT,
      )[0]?.ok,
    ).toBe(false);
    const severe = [...bons.slice(1), sortie(sains[0]!, { niveau: "élevé", score: 70 })];
    expect(
      evaluerPortes(
        calculerFauxPositifs(severe),
        calculerDetection([]),
        calculerExtraction([]),
        SEUILS_PAR_DEFAUT,
      )[1]?.ok,
    ).toBe(false);
  });

  it("sans aucun cas sain analysé, les portes principales ne sont pas franchies", () => {
    const portes = evaluerPortes(
      calculerFauxPositifs([]),
      calculerDetection([]),
      calculerExtraction([]),
      SEUILS_PAR_DEFAUT,
    );
    expect(portes[0]?.ok).toBe(false);
    expect(portes[1]?.ok).toBe(false);
  });

  it("le rapport met les faux positifs en premier et rappelle la portée statistique", () => {
    const rapport = agreger(
      [
        ...bons,
        sortie(cas("x", "suspect", "critique", { attendu: { niveauMin: "élevé" } }), {
          niveau: "élevé",
          score: 90,
        }),
      ],
      { modele: "claude-haiku-5-5", date: "2026-10-26", mode: "ia", repetitions: 1 },
    );
    const texte = formaterRapport(rapport);
    const iFp = texte.indexOf("FAUX POSITIFS SUR CONVERSATIONS SAINES");
    expect(iFp).toBeGreaterThan(-1);
    expect(iFp).toBeLessThan(texte.indexOf("DÉTECTION"));
    expect(texte).toContain("0/10 = 0,0 %");
    expect(texte).toContain("IC 95 %");
    expect(texte).toContain("Portée statistique");
    expect(texte).toContain("Tous les objectifs sont atteints");
  });

  it("le verdict distingue « principal atteint » de « tout atteint »", () => {
    const manque = cas("m", "suspect", "critique", { attendu: { niveauMin: "élevé" } });
    const texte = formaterRapport(
      agreger([...bons, sortie(manque, { niveau: "faible", score: 10 })], {
        modele: "claude-haiku-5-5",
        date: "2026-10-26",
        mode: "ia",
        repetitions: 1,
      }),
    );
    expect(texte).toContain("Objectifs principaux atteints, autres objectifs à travailler");
    expect(texte).toContain("✗ m (critique) : attendu élevé, obtenu faible");
  });

  it("le verdict signale l'échec de l'objectif principal", () => {
    const mauvais = sains.map((c) =>
      sortie(c, { niveau: "moyen", score: 40, scoreRegles: 40, scoreIa: 40 }),
    );
    const texte = formaterRapport(
      agreger(mauvais, {
        modele: "claude-haiku-5-5",
        date: "2026-10-26",
        mode: "ia",
        repetitions: 1,
      }),
    );
    expect(texte).toContain("Objectif principal non atteint");
    expect(texte).toContain("✗ s0");
  });

  it("agrège le coût et la durée des appels IA", () => {
    const ok: SuiviIa = {
      statut: "ok",
      modele: "claude-haiku-5-5",
      dureeMs: 2000,
      usage: { entree: 10_000, sortie: 2_000, cacheLecture: 0, cacheEcriture: 0 },
      avertissements: {
        messagesEcartes: 1,
        liensEcartes: 0,
        valeursInvalides: ["vendeur.nombre_avis"],
      },
    };
    const rapport = agreger([sortie(sains[0]!, { niveau: "faible", score: 1 }, ok)], {
      modele: "claude-haiku-5-5",
      date: "2026-10-26",
      mode: "ia",
      repetitions: 1,
    });
    expect(rapport.ia.appels).toBe(1);
    expect(rapport.ia.latenceP50Ms).toBe(2000);
    expect(rapport.ia.coutEstimeUsd).toBeCloseTo(0.002, 4);
    expect(rapport.ia.avertissements).toEqual({
      messagesEcartes: 1,
      liensEcartes: 0,
      valeursInvalides: 1,
    });
  });
});

describe("estimerCout", () => {
  it("Haiku 5.5 : 0,10 $ en entrée, 0,50 $ en sortie par million de jetons", () => {
    expect(
      estimerCout("claude-haiku-5-5", {
        entree: 1_000_000,
        sortie: 0,
        cacheLecture: 0,
        cacheEcriture: 0,
      }),
    ).toBeCloseTo(0.1);
    expect(
      estimerCout("claude-haiku-5-5", {
        entree: 0,
        sortie: 1_000_000,
        cacheLecture: 0,
        cacheEcriture: 0,
      }),
    ).toBeCloseTo(0.5);
  });

  it("compte le cache à tarif réduit et renvoie null pour un modèle inconnu", () => {
    const plein = estimerCout("claude-sonnet-5-5", {
      entree: 1_000_000,
      sortie: 0,
      cacheLecture: 0,
      cacheEcriture: 0,
    });
    const cache = estimerCout("claude-sonnet-5-5", {
      entree: 0,
      sortie: 0,
      cacheLecture: 1_000_000,
      cacheEcriture: 0,
    });
    expect(cache).toBeCloseTo((plein ?? 0) * 0.1);
    expect(
      estimerCout("claude-inconnu-9", { entree: 1, sortie: 1, cacheLecture: 0, cacheEcriture: 0 }),
    ).toBeNull();
  });
});
