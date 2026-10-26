import { describe, expect, it } from "vitest";
import { creerMessage, donneesExtraitesVides, type ExtractedData } from "../contracts/extracted";
import { SEUIL_ELEVE } from "../contracts/niveau";
import { analyserLiens } from "../links/analyse";
import { CATALOGUE } from "./catalog";
import { collecterLiensBruts } from "./contexte";
import { cumulerPoids, evaluerRegles } from "./moteur";
import { PLANCHER_CRITIQUE, REMISE_MAX } from "./poids";

function evaluer(modifier: (d: ExtractedData) => void, texte?: string) {
  const donnees = donneesExtraitesVides();
  modifier(donnees);
  const liens = analyserLiens(collecterLiensBruts(donnees, texte));
  return evaluerRegles({ donnees, texte, liens });
}

describe("cumulerPoids", () => {
  it.each([
    [[], 0],
    [[0.4], 40],
    [[0.4, 0.4], 64],
    [[0.5, 0.5, 0.5], 88],
    [[0.2, 0.2, 0.2, 0.2], 59],
  ])("%j → %i", (poids, attendu) => {
    expect(cumulerPoids(poids)).toBe(attendu);
  });

  it("ne dépasse jamais 100, même avec des poids aberrants", () => {
    expect(cumulerPoids([1, 1, 1])).toBeLessThanOrEqual(100);
    expect(cumulerPoids([5, -3])).toBeLessThanOrEqual(100);
    expect(cumulerPoids(Array(50).fill(0.9))).toBeLessThanOrEqual(100);
  });

  it("ajouter un signal ne fait jamais baisser le score", () => {
    const base = [0.3, 0.2];
    for (const w of [0, 0.05, 0.2, 0.7]) {
      expect(cumulerPoids([...base, w])).toBeGreaterThanOrEqual(cumulerPoids(base));
    }
  });
});

describe("evaluerRegles", () => {
  it("ne dit rien d'une entrée vide", () => {
    const r = evaluer(() => {});
    expect(r).toMatchObject({ score: 0, scoreBrut: 0, plancher: null, remise: 0 });
    expect(r.signaux).toEqual([]);
    expect(r.rassurants).toEqual([]);
    expect(r.conseils).toEqual([]);
  });

  it("est déterministe : même entrée, même sortie", () => {
    const f = (d: ExtractedData) => {
      d.messages = [creerMessage("vendeur", "Écris-moi sur WhatsApp, je préfère un virement")];
    };
    expect(evaluer(f)).toEqual(evaluer(f));
  });

  it("cumule les signaux comme des probabilités", () => {
    const r = evaluer((d) => {
      d.plateforme = "vinted";
      d.messages = [creerMessage("vendeur", "Écris-moi sur WhatsApp, je préfère un virement")];
    });
    const poids = r.constats.map((c) => c.poids);
    expect(r.scoreBrut).toBe(cumulerPoids(poids));
    expect(r.constats.map((c) => c.id).sort()).toEqual([
      "paiement.virement",
      "plateforme.whatsapp",
    ]);
    expect(r.plancher).toBeNull();
    expect(r.score).toBe(r.scoreBrut);
  });

  it("un même signal vu à deux endroits n'est compté qu'une fois", () => {
    const r = evaluer((d) => {
      d.annonce.description = "Paiement par virement possible";
      d.messages = [creerMessage("vendeur", "On fait un virement ?")];
    });
    expect(r.signaux.filter((s) => s.id === "paiement.virement")).toHaveLength(1);
  });

  it("ignore les messages de l'acheteur", () => {
    const r = evaluer((d) => {
      d.messages = [creerMessage("acheteur", "Écris-moi sur WhatsApp, virement ok ?")];
    });
    expect(r.signaux).toEqual([]);
  });

  it("lit aussi le texte brut collé", () => {
    const r = evaluer(() => {}, "On continue sur Telegram ?");
    expect(r.signaux.map((s) => s.id)).toContain("plateforme.telegram");
  });

  it("fait peser moins lourd les mêmes faits sur Leboncoin que sur Vinted", () => {
    const sur = (plateforme: "vinted" | "leboncoin") =>
      evaluer((d) => {
        d.plateforme = plateforme;
        d.messages = [creerMessage("vendeur", "Virement ou appelle-moi au 06 12 34 56 78")];
      }).score;
    expect(sur("leboncoin")).toBeLessThan(sur("vinted"));
  });
});

describe("virement proposé à côté d'une vente en direct", () => {
  const virement = (texte: string) =>
    evaluer((d) => {
      d.plateforme = "vinted";
      d.messages = [creerMessage("vendeur", texte)];
    }).constats.find((c) => c.id === "paiement.virement");

  it("pèse moins quand il est proposé avec des espèces ou une remise en main propre", () => {
    expect(
      virement("Paiement en espèces à la remise, ou virement instantané si tu préfères.")?.gravite,
    ).toBe("attention");
    expect(virement("Remise en main propre, ou virement si tu es loin.")?.gravite).toBe(
      "attention",
    );
  });

  it("garde son poids ordinaire sans indice de vente locale", () => {
    expect(virement("Je préfère un virement, je te donne mon IBAN.")?.gravite).toBe("importante");
  });

  it("n'atténue pas la sortie de plateforme qui l'accompagne", () => {
    const r = evaluer((d) => {
      d.plateforme = "vinted";
      d.messages = [
        creerMessage("vendeur", "Écris-moi sur WhatsApp, espèces ou virement, comme tu veux"),
      ];
    });
    expect(r.constats.find((c) => c.id === "plateforme.whatsapp")?.gravite).toBe("importante");
  });

  it("« mandat cash » ne compte pas comme une vente en direct", () => {
    const r = evaluer((d) => {
      d.messages = [creerMessage("vendeur", "Je n'accepte que le mandat cash ou un virement")];
    });
    expect(r.constats.find((c) => c.id === "paiement.virement")?.gravite).toBe("importante");
    expect(r.plancher).not.toBeNull();
  });
});

describe("plancher des signaux critiques", () => {
  const codeSms = (d: ExtractedData) => {
    d.messages = [creerMessage("vendeur", "Envoie-moi le code reçu par SMS")];
  };

  it("un signal critique impose son plancher, même seul", () => {
    const r = evaluer(codeSms);
    expect(r.plancher).toBe(85);
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it("relève le score au plancher quand le cumul des poids reste en dessous", () => {
    // Mandat cash : poids 0,6 (score brut 60) mais plancher 75.
    const r = evaluer((d) => {
      d.messages = [creerMessage("vendeur", "Je n'accepte que le mandat cash")];
    });
    expect(r.scoreBrut).toBe(60);
    expect(r.plancher).toBe(75);
    expect(r.score).toBe(75);
  });

  it("garde le plancher le plus élevé quand il y en a plusieurs", () => {
    const r = evaluer((d) => {
      d.messages = [
        creerMessage(
          "vendeur",
          "Envoie-moi le code reçu par SMS. Sinon paiement par mandat cash ou Neosurf.",
        ),
      ];
    });
    expect(r.constats.filter((c) => c.gravite === "critique").length).toBeGreaterThan(1);
    expect(r.plancher).toBe(85);
  });

  it("n'est jamais abaissé par des rassurants", () => {
    const r = evaluer((d) => {
      codeSms(d);
      d.vendeur.anciennete_jours = 2000;
      d.vendeur.nombre_avis = 300;
      d.vendeur.note_sur_5 = 5;
      d.vendeur.profil_verifie = true;
    });
    expect(r.remise).toBe(REMISE_MAX);
    expect(r.plancher).toBe(85);
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it("un lien critique impose le plancher des liens", () => {
    const r = evaluer((d) => {
      d.messages = [creerMessage("vendeur", "Paie ici : vinted-paiement.com")];
    });
    expect(r.plancher).toBe(75);
    expect(r.signaux[0]?.gravite).toBe("critique");
  });

  it("la gravité critique par défaut mène au niveau « élevé »", () => {
    expect(PLANCHER_CRITIQUE).toBeGreaterThanOrEqual(SEUIL_ELEVE);
  });
});

describe("rassurants et remise", () => {
  const profil = (d: ExtractedData) => {
    d.vendeur.anciennete_jours = 900;
    d.vendeur.nombre_avis = 120;
    d.vendeur.note_sur_5 = 4.9;
    d.vendeur.profil_verifie = true;
  };

  it("un profil solide donne les trois rassurants du profil et la remise maximale", () => {
    const r = evaluer(profil);
    expect(r.rassurants.map((x) => x.id).sort()).toEqual([
      "profil.compte_ancien",
      "profil.nombreux_avis",
      "profil.verifie",
    ]);
    expect(r.remise).toBe(REMISE_MAX);
    expect(r.score).toBe(0);
  });

  it("des seuils plus bas donnent des remises plus petites", () => {
    const r = evaluer((d) => {
      d.vendeur.anciennete_jours = 400;
      d.vendeur.nombre_avis = 12;
      d.vendeur.note_sur_5 = 4.4;
    });
    expect(r.rassurants.map((x) => x.id).sort()).toEqual([
      "profil.compte_assez_ancien",
      "profil.plusieurs_avis",
    ]);
    expect(r.remise).toBe(4);
  });

  it("« paiement via la plateforme » s'affiche mais ne fait rien baisser", () => {
    const r = evaluer((d) => {
      d.messages = [creerMessage("vendeur", "Le paiement se fait par Vinted, j'envoie demain.")];
    });
    expect(r.rassurants.map((x) => x.id)).toEqual(["plateforme.paiement"]);
    expect(r.remise).toBe(0);
  });

  it("n'affiche pas « paiement via la plateforme » quand un paiement hors plateforme est évoqué", () => {
    const r = evaluer((d) => {
      d.messages = [
        creerMessage("vendeur", "Le paiement se fait par Vinted. Sinon virement possible."),
      ];
    });
    expect(r.signaux.map((s) => s.id)).toContain("paiement.virement");
    expect(r.rassurants.map((x) => x.id)).not.toContain("plateforme.paiement");
  });
});

describe("liens", () => {
  it("plusieurs liens levant le même signal ne comptent qu'une fois, au niveau le plus grave", () => {
    const r = evaluer((d) => {
      d.liens = ["vlnted.fr", "https://vinted-paiement.com", "https://vinted-boutique.net"];
    });
    const ids = r.signaux.map((s) => s.id);
    expect(ids.filter((id) => id === "lien.imitation_marque")).toHaveLength(1);
    expect(r.signaux.find((s) => s.id === "lien.imitation_marque")?.gravite).toBe("critique");
  });

  it("un lien inconnu sans signal est « à vérifier », pas plus", () => {
    const r = evaluer((d) => {
      d.liens = ["https://www.decathlon.fr/p/velo"];
    });
    expect(r.signaux.map((s) => s.id)).toEqual(["liens.externe"]);
    expect(r.signaux[0]?.gravite).toBe("attention");
  });

  it("un lien officiel ne lève rien", () => {
    const r = evaluer((d) => {
      d.liens = ["https://www.vinted.fr/items/123"];
    });
    expect(r.signaux).toEqual([]);
  });

  it("un lien WhatsApp compte comme une sortie de plateforme, sans « lien externe »", () => {
    const r = evaluer((d) => {
      d.liens = ["https://wa.me/33612345678"];
    });
    const ids = r.signaux.map((s) => s.id);
    expect(ids).toContain("plateforme.whatsapp");
    expect(ids).not.toContain("liens.externe");
  });
});

describe("catalogue", () => {
  it("chaque règle a un nom unique", () => {
    const noms = CATALOGUE.map((r) => r.nom);
    expect(new Set(noms).size).toBe(noms.length);
  });
});
