import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AiEvaluationSchema,
  AnalysisResultSchema,
  AnalyzeTextInputSchema,
  ApiErrorSchema,
  CODES_ERREUR,
  ExtractedDataSchema,
  FeedbackInputSchema,
  GRAVITES,
  GRAVITES_IA,
  MAX_TEXT_CHARS,
  SignalSchema,
  aUneEntree,
  donneesExtraitesVides,
  niveauPourScore,
  nombreImagesValide,
  rangGravite,
  trancheDeScore,
  type AiEvaluation,
  type AnalysisResult,
} from "./index";

function evaluationValide(): AiEvaluation {
  return {
    donnees_extraites: {
      ...donneesExtraitesVides(),
      plateforme: "vinted",
      ecrans: ["annonce", "profil_vendeur"],
      annonce: {
        titre: "Sac à main",
        prix_eur: 45,
        marque: "Louis Vuitton",
        categorie: "sac à main",
        description: null,
        nombre_photos: 2,
      },
      vendeur: {
        anciennete_jours: 12,
        nombre_avis: 0,
        note_sur_5: null,
        localisation: null,
        nombre_annonces: 14,
        profil_verifie: false,
      },
    },
    contenu_exploitable: true,
    score: 78,
    niveau: "élevé",
    signaux: [
      {
        label: "Le prix est très inférieur à ce qu'on voit d'habitude pour cette marque.",
        gravite: "importante",
      },
      { label: "Le compte a été créé il y a peu de temps.", gravite: "attention" },
    ],
    rassurants: [{ label: "Le vendeur propose la livraison via la plateforme." }],
    conseils: ["Reste dans la messagerie de la plateforme."],
  };
}

describe("niveauPourScore", () => {
  it.each([
    [0, "faible"],
    [29, "faible"],
    [30, "moyen"],
    [59, "moyen"],
    [60, "élevé"],
    [100, "élevé"],
  ])("score %i → %s", (score, niveau) => {
    expect(niveauPourScore(score)).toBe(niveau);
  });
});

describe("trancheDeScore", () => {
  it.each([
    [0, 0],
    [9, 0],
    [10, 10],
    [89, 80],
    [90, 90],
    [100, 90],
  ])("score %i → tranche %i", (score, tranche) => {
    expect(trancheDeScore(score)).toBe(tranche);
  });
});

describe("gravités", () => {
  it("sont ordonnées de la moins grave à la plus grave", () => {
    expect([...GRAVITES]).toEqual(["info", "attention", "importante", "critique"]);
    expect(rangGravite("critique")).toBeGreaterThan(rangGravite("importante"));
    expect(rangGravite("info")).toBe(0);
  });

  it("l'IA ne peut pas émettre « critique »", () => {
    expect([...GRAVITES_IA]).not.toContain("critique");
    const eval_ = evaluationValide();
    eval_.signaux = [{ label: "Test", gravite: "critique" as never }];
    expect(AiEvaluationSchema.safeParse(eval_).success).toBe(false);
  });

  it("un signal issu d'une règle peut être critique", () => {
    const signal = {
      id: "lien.imitation_marque",
      label: "Le lien imite le nom d'une plateforme connue.",
      gravite: "critique",
      source: "regle",
    };
    expect(SignalSchema.safeParse(signal).success).toBe(true);
  });
});

describe("AiEvaluationSchema", () => {
  it("accepte une évaluation valide", () => {
    expect(AiEvaluationSchema.safeParse(evaluationValide()).success).toBe(true);
  });

  it.each([-1, 101, 12.5, Number.NaN])("rejette le score %s", (score) => {
    expect(AiEvaluationSchema.safeParse({ ...evaluationValide(), score }).success).toBe(false);
  });

  it("rejette un niveau inconnu", () => {
    expect(
      AiEvaluationSchema.safeParse({ ...evaluationValide(), niveau: "critique" }).success,
    ).toBe(false);
  });

  it("rejette une évaluation sans données extraites", () => {
    const sans: Partial<AiEvaluation> = evaluationValide();
    delete sans.donnees_extraites;
    expect(AiEvaluationSchema.safeParse(sans).success).toBe(false);
  });

  it("accepte des listes vides et des champs null", () => {
    const e = evaluationValide();
    e.signaux = [];
    e.rassurants = [];
    e.conseils = [];
    expect(AiEvaluationSchema.safeParse(e).success).toBe(true);
  });

  it("ignore les champs inattendus au lieu d'échouer", () => {
    const parsed = AiEvaluationSchema.parse({ ...evaluationValide(), commentaire: "bonus" });
    expect(parsed).not.toHaveProperty("commentaire");
  });
});

describe("AiEvaluationSchema → JSON Schema", () => {
  const json = z.toJSONSchema(AiEvaluationSchema) as {
    properties: Record<string, unknown>;
    required: string[];
  };

  it("se convertit sans erreur (requis pour les sorties structurées)", () => {
    expect(json.required).toEqual(
      expect.arrayContaining([
        "donnees_extraites",
        "score",
        "niveau",
        "signaux",
        "rassurants",
        "conseils",
      ]),
    );
  });

  it("place donnees_extraites en premier : le modèle lit avant d'évaluer", () => {
    expect(Object.keys(json.properties)[0]).toBe("donnees_extraites");
  });
});

describe("ExtractedDataSchema", () => {
  it("les données vides sont valides", () => {
    expect(ExtractedDataSchema.safeParse(donneesExtraitesVides()).success).toBe(true);
  });

  it("rejette une note hors de 0–5 et un prix négatif", () => {
    const d = donneesExtraitesVides();
    d.vendeur.note_sur_5 = 6;
    expect(ExtractedDataSchema.safeParse(d).success).toBe(false);
    const e = donneesExtraitesVides();
    e.annonce.prix_eur = -3;
    expect(ExtractedDataSchema.safeParse(e).success).toBe(false);
  });
});

describe("AnalysisResultSchema", () => {
  const resultat = (): AnalysisResult => ({
    score: 82,
    niveau: "élevé",
    signaux: [
      {
        id: "lien.imitation_marque",
        label: "Le lien imite le nom d'une plateforme connue.",
        gravite: "critique",
        source: "regle",
      },
    ],
    rassurants: [
      { id: "profil.ancien", label: "Le compte existe depuis longtemps.", source: "regle" },
    ],
    conseils: ["Ne clique pas sur le lien."],
    donnees_extraites: donneesExtraitesVides(),
    meta: { mode: "complet", score_regles: 80, score_ia: 70, plancher: 75 },
  });

  it("accepte un résultat complet", () => {
    expect(AnalysisResultSchema.safeParse(resultat()).success).toBe(true);
  });

  it("accepte le mode règles seules sans score IA ni plancher", () => {
    const r = resultat();
    r.meta = { mode: "regles_seules", score_regles: 40, score_ia: null, plancher: null };
    expect(AnalysisResultSchema.safeParse(r).success).toBe(true);
  });
});

describe("AnalyzeTextInputSchema", () => {
  it("traite les champs vides comme absents", () => {
    const parsed = AnalyzeTextInputSchema.parse({ texte: "   ", lien: "" });
    expect(parsed.texte).toBeUndefined();
    expect(parsed.lien).toBeUndefined();
  });

  it("retire les espaces autour du texte", () => {
    expect(AnalyzeTextInputSchema.parse({ texte: "  salut  " }).texte).toBe("salut");
  });

  it("rejette un texte trop long", () => {
    const trop = "a".repeat(MAX_TEXT_CHARS + 1);
    expect(AnalyzeTextInputSchema.safeParse({ texte: trop }).success).toBe(false);
  });

  it("exige au moins une capture, un texte ou un lien", () => {
    expect(aUneEntree({}, 0)).toBe(false);
    expect(aUneEntree({}, 1)).toBe(true);
    expect(aUneEntree({ texte: "x" }, 0)).toBe(true);
    expect(aUneEntree({ lien: "https://example.com" }, 0)).toBe(true);
  });

  it("limite le nombre d'images", () => {
    expect(nombreImagesValide(0)).toBe(true);
    expect(nombreImagesValide(3)).toBe(true);
    expect(nombreImagesValide(4)).toBe(false);
    expect(nombreImagesValide(-1)).toBe(false);
  });
});

describe("FeedbackInputSchema", () => {
  const id = "6f1f3a52-3c1b-4a56-9d5e-0b2c7d9f1a10";

  it("accepte un identifiant d'analyse et un vote", () => {
    expect(FeedbackInputSchema.safeParse({ analyse_id: id, vote: "up" }).success).toBe(true);
  });

  it("rejette un identifiant qui n'est pas un UUID ou un vote inconnu", () => {
    expect(FeedbackInputSchema.safeParse({ analyse_id: "abc", vote: "up" }).success).toBe(false);
    expect(FeedbackInputSchema.safeParse({ analyse_id: id, vote: "peut-être" }).success).toBe(
      false,
    );
  });

  it("le score n'est plus fourni par le client : il vient du serveur", () => {
    expect(FeedbackInputSchema.safeParse({ score: 72, vote: "up" }).success).toBe(false);
  });

  it("ne conserve rien d'autre que l'identifiant et le vote", () => {
    const parsed = FeedbackInputSchema.parse({
      analyse_id: id,
      vote: "down",
      score: 50,
      niveau: "faible",
      texte: "contenu privé",
    });
    expect(Object.keys(parsed).sort()).toEqual(["analyse_id", "vote"]);
  });
});

describe("tranche et niveau", () => {
  it("le niveau se retrouve à partir de la tranche : les seuils sont des multiples de 10", () => {
    for (let score = 0; score <= 100; score++) {
      expect(niveauPourScore(trancheDeScore(score))).toBe(niveauPourScore(score));
    }
  });
});

describe("ApiErrorSchema", () => {
  it("accepte chaque code d'erreur", () => {
    for (const code of CODES_ERREUR) {
      expect(ApiErrorSchema.safeParse({ erreur: { code, message: "x" } }).success).toBe(true);
    }
  });

  it("rejette un code inconnu", () => {
    expect(ApiErrorSchema.safeParse({ erreur: { code: "boum", message: "x" } }).success).toBe(
      false,
    );
  });
});
