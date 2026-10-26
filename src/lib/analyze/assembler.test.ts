import { describe, expect, it } from "vitest";
import type { AiEvaluation } from "../contracts/ai";
import { donneesExtraitesVides } from "../contracts/extracted";
import { SEUIL_ELEVE } from "../contracts/niveau";
import { AnalysisResultSchema } from "../contracts/result";
import { rangGravite } from "../contracts/signals";
import { trouverFormulationsInterdites } from "../copy/wording";
import { TOUS_LES_CAS, type CasConversation } from "../rules/fixtures/cas";
import { lancer } from "../rules/fixtures/lancer";
import type { ResultatRegles } from "../rules/types";
import { assemblerResultat } from "./assembler";
import { memeIdee, nettoyerLibelleIa, sansDoublons } from "./nettoyage";

const cas = (nom: string): CasConversation => {
  const c = TOUS_LES_CAS.find((x) => x.nom.startsWith(nom));
  if (!c) throw new Error(`cas introuvable : ${nom}`);
  return c;
};

function iaFactice(partiel: Partial<AiEvaluation> = {}): AiEvaluation {
  return {
    donnees_extraites: donneesExtraitesVides(),
    score: 10,
    niveau: "faible",
    signaux: [],
    rassurants: [],
    conseils: [],
    ...partiel,
  };
}

function assembler(c: CasConversation, ia: AiEvaluation | null) {
  const { donnees, regles } = lancer(c);
  return assemblerResultat({ donnees, regles, ia });
}

const whatsappVirement = () => cas("WhatsApp + virement");
const sain = () => cas("Vinted : profil solide");

describe("assemblerResultat : modes", () => {
  it("sans IA : analyse partielle, score des règles, données lues par les règles", () => {
    const r = assembler(whatsappVirement(), null);
    expect(r.meta.mode).toBe("regles_seules");
    expect(r.meta.score_ia).toBeNull();
    expect(r.score).toBe(r.meta.score_regles);
    expect(r.signaux.every((s) => s.source === "regle")).toBe(true);
  });

  it("avec IA : mode complet, scores des deux sources dans meta, données de l'IA", () => {
    const donnees = donneesExtraitesVides();
    donnees.annonce.titre = "Titre lu par l'IA";
    const r = assembler(whatsappVirement(), iaFactice({ score: 70, donnees_extraites: donnees }));
    expect(r.meta.mode).toBe("complet");
    expect(r.meta.score_ia).toBe(70);
    expect(r.donnees_extraites.annonce.titre).toBe("Titre lu par l'IA");
  });

  it("le niveau se déduit du score final, pas de celui que renvoie l'IA", () => {
    const r = assembler(whatsappVirement(), iaFactice({ score: 95, niveau: "faible" }));
    expect(r.score).toBeGreaterThanOrEqual(SEUIL_ELEVE);
    expect(r.niveau).toBe("élevé");
  });

  it("produit un résultat valide pour chaque cas, avec et sans IA", () => {
    for (const c of TOUS_LES_CAS) {
      const { regles } = lancer(c);
      for (const ia of [null, iaFactice({ score: regles.score })]) {
        const r = assembler(c, ia);
        const parse = AnalysisResultSchema.safeParse(r);
        expect(parse.success, `${c.nom} : ${parse.success ? "" : parse.error.message}`).toBe(true);
      }
    }
  });
});

describe("assemblerResultat : plancher et rassurants", () => {
  it("l'IA ne fait pas descendre un signal critique sous son plancher", () => {
    const c = cas("Demande du code reçu par SMS (« envoyez");
    const r = assembler(c, iaFactice({ score: 0, niveau: "faible" }));
    expect(r.meta.plancher).toBe(85);
    expect(r.score).toBeGreaterThanOrEqual(85);
    expect(r.niveau).toBe("élevé");
  });

  it("un signal de l'IA n'impose jamais de plancher, même « importante »", () => {
    const r = assembler(
      sain(),
      iaFactice({
        score: 20,
        signaux: [
          { label: "Le profil semble très actif pour un compte récent.", gravite: "importante" },
        ],
      }),
    );
    expect(r.meta.plancher).toBeNull();
    expect(r.signaux.find((s) => s.source === "ia")?.gravite).toBe("importante");
  });

  it("les rassurants du profil baissent légèrement le score", () => {
    const { donnees, regles } = lancer(sain());
    const avec = assemblerResultat({
      donnees,
      regles: { ...regles, score: 30, remise: 10 },
      ia: null,
    });
    const sans = assemblerResultat({
      donnees,
      regles: { ...regles, score: 30, remise: 0 },
      ia: null,
    });
    expect(avec.score).toBe(20);
    expect(sans.score).toBe(30);
  });

  it("mais ils ne font pas passer un score de « élevé » à « moyen »", () => {
    const { donnees, regles } = lancer(sain());
    const forcee: ResultatRegles = { ...regles, score: 62, scoreBrut: 62, remise: 10 };
    const r = assemblerResultat({ donnees, regles: forcee, ia: null });
    expect(r.score).toBe(SEUIL_ELEVE);
    expect(r.niveau).toBe("élevé");
  });

  it("garde les rassurants des règles et ajoute ceux de l'IA sans doublon", () => {
    const r = assembler(
      sain(),
      iaFactice({
        rassurants: [
          { label: "Le compte existe depuis longtemps." },
          { label: "Les photos montrent l'article sous plusieurs angles." },
        ],
      }),
    );
    const labels = r.rassurants.map((x) => x.label);
    expect(labels.filter((l) => l.includes("depuis longtemps"))).toHaveLength(1);
    expect(r.rassurants.find((x) => x.source === "ia")?.label).toContain("plusieurs angles");
  });

  it("écarte un rassurant de l'IA qui contredit un signal de paiement", () => {
    const r = assembler(
      whatsappVirement(),
      iaFactice({
        rassurants: [
          { label: "Le paiement passe par la plateforme." },
          { label: "Le vendeur répond poliment et en détail." },
        ],
      }),
    );
    const labels = r.rassurants.map((x) => x.label);
    expect(labels.some((l) => /paiement/i.test(l))).toBe(false);
    expect(labels.some((l) => l.includes("répond poliment"))).toBe(true);
  });
});

describe("assemblerResultat : signaux de l'IA", () => {
  it("écarte un libellé accusatoire au lieu de le réécrire", () => {
    const r = assembler(
      sain(),
      iaFactice({
        signaux: [
          { label: "C'est un arnaqueur évident, ne réponds pas.", gravite: "importante" },
          { label: "Le message ressemble à un modèle copié-collé.", gravite: "attention" },
        ],
      }),
    );
    const iaLabels = r.signaux.filter((s) => s.source === "ia").map((s) => s.label);
    expect(iaLabels).toEqual(["Le message ressemble à un modèle copié-collé."]);
  });

  it("coupe les libellés trop longs proprement", () => {
    const long = `Le message ${"insiste lourdement sur un point précis ".repeat(10)}`.trim();
    const r = assembler(sain(), iaFactice({ signaux: [{ label: long, gravite: "attention" }] }));
    const label = r.signaux.find((s) => s.source === "ia")?.label ?? "";
    expect(label.length).toBeLessThanOrEqual(160);
    expect(label.endsWith("…")).toBe(true);
  });

  it("n'affiche pas deux fois ce qu'une règle a déjà dit", () => {
    const r = assembler(
      whatsappVirement(),
      iaFactice({
        signaux: [
          {
            label: "On propose de passer sur WhatsApp, hors de la plateforme.",
            gravite: "importante",
          },
          { label: "Le texte est rédigé comme un message type.", gravite: "attention" },
        ],
      }),
    );
    const iaLabels = r.signaux.filter((s) => s.source === "ia").map((s) => s.label);
    expect(iaLabels).toEqual(["Le texte est rédigé comme un message type."]);
  });

  it("numérote les signaux de l'IA et en garde huit au plus", () => {
    const signaux = Array.from({ length: 12 }, (_, i) => ({
      label: `Observation numéro ${i + 1} sur la formulation du message.`,
      gravite: "info" as const,
    }));
    // Libellés très différents pour éviter la déduplication par recouvrement de mots.
    const distincts = signaux.map((s, i) => ({
      ...s,
      label:
        [
          "alpha",
          "bravo",
          "charlie",
          "delta",
          "echo",
          "foxtrot",
          "golf",
          "hotel",
          "india",
          "juliet",
          "kilo",
          "lima",
        ][i]! +
        " " +
        s.label.replace(
          /numéro \d+ sur la formulation/,
          `particulière ${"x".repeat(i + 1)} concernant le ton`,
        ),
    }));
    const r = assembler(sain(), iaFactice({ signaux: distincts }));
    const ia = r.signaux.filter((s) => s.source === "ia");
    expect(ia.length).toBeLessThanOrEqual(8);
    expect(ia.map((s) => s.id)).toEqual(ia.map((_, i) => `ia.${i + 1}`));
  });

  it("trie du plus grave au moins grave, les règles avant l'IA à gravité égale", () => {
    const r = assembler(
      whatsappVirement(),
      iaFactice({
        signaux: [
          {
            label: "Le style du message est inhabituel pour un particulier.",
            gravite: "importante",
          },
          { label: "La photo de profil semble absente de l'écran.", gravite: "info" },
        ],
      }),
    );
    const rangs = r.signaux.map((s) => rangGravite(s.gravite));
    expect(rangs).toEqual([...rangs].sort((a, b) => b - a));
    const importantes = r.signaux.filter((s) => s.gravite === "importante");
    const premiereIa = importantes.findIndex((s) => s.source === "ia");
    const derniereRegle = importantes.map((s) => s.source).lastIndexOf("regle");
    expect(premiereIa === -1 || derniereRegle < premiereIa).toBe(true);
  });
});

describe("assemblerResultat : conseils", () => {
  it("met d'abord les conseils des règles, puis ceux de l'IA, sans doublon", () => {
    const r = assembler(
      whatsappVirement(),
      iaFactice({
        conseils: [
          "Reste dans la messagerie de la plateforme, c'est elle qui te protège en cas de problème.",
          "Vérifie sur le site du transporteur que le numéro de suivi existe bien.",
        ],
      }),
    );
    expect(r.conseils[0]).toContain("messagerie de la plateforme");
    expect(r.conseils.filter((c) => c.includes("messagerie de la plateforme"))).toHaveLength(1);
    expect(r.conseils.some((c) => c.includes("numéro de suivi"))).toBe(true);
  });

  it("complète avec des conseils par défaut pour avoir au moins deux conseils", () => {
    const r = assembler(sain(), null);
    expect(r.conseils.length).toBeGreaterThanOrEqual(2);
  });

  it("n'en affiche jamais plus de cinq, et aucun n'est accusatoire", () => {
    const nombreux = Array.from(
      { length: 9 },
      (_, i) => `Conseil distinct ${"abcdefghi"[i]!.repeat(5)} à appliquer sans tarder.`,
    );
    const r = assembler(
      whatsappVirement(),
      iaFactice({ conseils: ["Ne réponds pas à cet escroc, bloque-le.", ...nombreux] }),
    );
    expect(r.conseils.length).toBeLessThanOrEqual(5);
    for (const c of r.conseils) expect(trouverFormulationsInterdites(c), c).toEqual([]);
  });
});

describe("nettoyage", () => {
  it("nettoyerLibelleIa retire puces, guillemets et espaces superflus", () => {
    expect(nettoyerLibelleIa("  - «  Le prix est très bas.  » ")).toBe("Le prix est très bas.");
    expect(nettoyerLibelleIa("1) Le compte est récent")).toBe("Le compte est récent");
  });

  it("nettoyerLibelleIa écarte le vide, le trop court et l'accusatoire", () => {
    expect(nettoyerLibelleIa("   ")).toBeNull();
    expect(nettoyerLibelleIa("ok")).toBeNull();
    expect(nettoyerLibelleIa("Ce vendeur est un escroc")).toBeNull();
    expect(nettoyerLibelleIa("Aucun risque avec ce vendeur")).toBeNull();
  });

  it("memeIdee repère deux formulations d'un même fait", () => {
    expect(
      memeIdee(
        "On te propose de continuer la discussion sur WhatsApp, en dehors de la plateforme.",
        "Le vendeur propose de passer sur WhatsApp, hors de la plateforme.",
      ),
    ).toBe(true);
    expect(memeIdee("Le compte est récent.", "Le prix est très bas.")).toBe(false);
    expect(memeIdee("Le compte est récent.", "Le compte n'a aucun avis.")).toBe(false);
  });

  it("sansDoublons écarte les répétitions entre elles et avec l'existant", () => {
    expect(
      sansDoublons(
        ["Photos peu nombreuses sur cette annonce.", "Photos peu nombreuses sur cette annonce."],
        [],
      ),
    ).toHaveLength(1);
    expect(sansDoublons(["Le compte est récent."], ["le compte est récent."])).toEqual([]);
  });
});
