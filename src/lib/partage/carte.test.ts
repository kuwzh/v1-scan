import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trouverFormulationsInterdites } from "../copy/wording";
import { fr } from "../copy/fr";
import {
  HOTE_PAR_DEFAUT,
  MAX_SIGNAUX_CARTE,
  construireCarte,
  hotePartage,
  libelleEcartPrix,
  phraseSignal,
} from "./carte";
import {
  DOMAINE,
  PRIX_EXACT,
  PSEUDO,
  entree,
  entreeChargee,
  prixOk,
  rassurant,
  signal,
} from "./test-utils";

describe("construireCarte : score faible", () => {
  const carte = construireCarte(
    entree(12, "faible", {
      plateforme: "vinted",
      signaux: [
        signal("profil.non_verifie", "info"),
        signal("ia.1", "attention", `${PSEUDO} a l'air pressé`, "ia"),
      ],
      rassurants: [
        rassurant("profil.compte_ancien"),
        rassurant("ia.rassurant.1", `${PSEUDO} a de bonnes notes`, "ia"),
      ],
    }),
  );

  it("données affichées", () => {
    expect(carte).toEqual({
      score: 12,
      niveau: "faible",
      titreNiveau: "Risque faible",
      // Aucun signal des règles à montrer : une phrase de repli, pas le texte de l'IA.
      signaux: [{ texte: "Peu de signaux d'alerte repérés.", gravite: "info" }],
      autres: 0,
      rassurant: "Le compte existe depuis longtemps.",
      site: "Annonce Vinted",
      ecartPrix: null,
      hote: "v1-scan.vercel.app",
      accroche: "Vérifie tes annonces avant de payer",
      mention: "Estimation, aide à la décision",
    });
  });
});

describe("construireCarte : score moyen", () => {
  const carte = construireCarte(
    entree(45, "moyen", {
      site: "leboncoin",
      prix: prixOk(-58),
      signaux: [
        signal("plateforme.whatsapp", "importante"),
        signal("prix.web", "importante"),
        signal("paiement.virement", "attention"),
        signal("urgence.forte", "attention"),
        signal("profil.compte_recent", "attention"),
        signal("annonce.une_photo", "info"),
      ],
    }),
  );

  it("données affichées", () => {
    expect(carte).toEqual({
      score: 45,
      niveau: "moyen",
      titreNiveau: "Risque moyen",
      signaux: [
        { texte: "On te propose de passer sur WhatsApp.", gravite: "importante" },
        { texte: "Un paiement par virement est évoqué.", gravite: "attention" },
        { texte: "On te met la pression pour aller vite.", gravite: "attention" },
      ],
      autres: 1,
      rassurant: null,
      // La plateforme n'a pas été lue : on reprend le choix de l'utilisateur.
      site: "Annonce Leboncoin",
      // −58 % arrondi à −60 %. Le signal « prix.web » n'est pas répété dans la liste.
      ecartPrix: "−60 % vs prix d'occasion habituel",
      hote: "v1-scan.vercel.app",
      accroche: "Vérifie tes annonces avant de payer",
      mention: "Estimation, aide à la décision",
    });
  });
});

describe("construireCarte : score élevé", () => {
  const carte = construireCarte(entreeChargee());

  it("données affichées : les trois plus graves, dans l'ordre, et le décompte du reste", () => {
    expect(carte.niveau).toBe("élevé");
    expect(carte.titreNiveau).toBe("Risque élevé");
    expect(carte.signaux).toEqual([
      { texte: "Paiement demandé par mandat, carte cadeau ou crypto.", gravite: "critique" },
      { texte: "Un lien est envoyé pour « recevoir » un paiement.", gravite: "critique" },
      { texte: "Des informations de carte bancaire sont demandées.", gravite: "critique" },
    ]);
    // 2 « importante » et 1 « attention » des règles + 1 signal de l'IA, non montrés.
    expect(carte.autres).toBe(4);
    expect(carte.rassurant).toBe("Le profil est vérifié par la plateforme.");
    expect(carte.site).toBe("Annonce Facebook Marketplace");
    expect(carte.ecartPrix).toBe("−65 % vs prix d'occasion habituel");
  });
});

describe("construireCarte : choix des signaux", () => {
  it("jamais plus de trois, et pas de signal « à noter » (info)", () => {
    const c = construireCarte(
      entree(50, "moyen", {
        signaux: [
          signal("profil.non_verifie", "info"),
          signal("annonce.une_photo", "info"),
          signal("plateforme.sms", "attention"),
        ],
      }),
    );
    expect(c.signaux).toEqual([
      { texte: "On te propose de continuer par SMS.", gravite: "attention" },
    ]);
    expect(MAX_SIGNAUX_CARTE).toBe(3);
  });

  it("ne répète pas une même phrase (deux signaux de lien qui disent la même chose)", () => {
    const c = construireCarte(
      entree(60, "élevé", {
        signaux: [
          signal("lien.marque_sous_domaine", "importante"),
          signal("lien.marque_dans_chemin", "importante"),
        ],
      }),
    );
    expect(c.signaux).toHaveLength(1);
    expect(c.autres).toBe(0);
  });

  it("score porté par l'IA seule : phrase de repli du niveau, sans le texte de l'IA", () => {
    const c = construireCarte(
      entree(70, "élevé", {
        signaux: [signal("ia.1", "importante", `${PSEUDO} insiste`, "ia")],
      }),
    );
    expect(c.signaux).toEqual([
      { texte: "Plusieurs points inhabituels repérés.", gravite: "info" },
    ]);
    expect(c.autres).toBe(0);
  });

  it("« prix.web » en attention : formulation nuancée", () => {
    expect(phraseSignal("prix.web", "attention")).toBe(
      "Le prix est nettement inférieur au marché de l'occasion.",
    );
    expect(phraseSignal("prix.web", "importante")).toBe(
      "Le prix est très inférieur au marché de l'occasion.",
    );
  });

  it("sans comparaison de prix, le signal de la table reste dans la liste, sans montant", () => {
    const c = construireCarte(
      entree(55, "moyen", {
        signaux: [
          signal("prix.tres_bas", "importante", `Le prix de ${PRIX_EXACT} est très inférieur…`),
        ],
      }),
    );
    expect(c.signaux[0]?.texte).toBe("Le prix est très inférieur à l'habitude.");
    expect(JSON.stringify(c)).not.toContain("45");
  });

  it("règle inconnue : phrase de repli selon la gravité, jamais son libellé", () => {
    const c = construireCarte(
      entree(40, "moyen", { signaux: [signal("nouvelle.regle", "importante", `${DOMAINE} !`)] }),
    );
    expect(c.signaux[0]?.texte).toBe("Un point important a été repéré.");
  });

  it("prend le rassurant des règles, jamais celui de l'IA", () => {
    const c = construireCarte(
      entree(10, "faible", { rassurants: [rassurant("ia.rassurant.1", "Un super vendeur", "ia")] }),
    );
    expect(c.rassurant).toBeNull();
  });
});

describe("construireCarte : site et prix", () => {
  it("la plateforme lue prime sur le choix de l'utilisateur ; « autre » n'affiche rien", () => {
    expect(
      construireCarte(entree(5, "faible", { plateforme: "leboncoin", site: "vinted" })).site,
    ).toBe("Annonce Leboncoin");
    expect(construireCarte(entree(5, "faible", { site: "autre" })).site).toBeNull();
    expect(
      construireCarte(entree(5, "faible", { plateforme: "autre", site: null })).site,
    ).toBeNull();
    expect(construireCarte(entree(5, "faible")).site).toBeNull();
  });

  it("pas d'écart de prix sans comparaison, ou avec une estimation peu fiable", () => {
    expect(construireCarte(entree(5, "faible")).ecartPrix).toBeNull();
    expect(construireCarte(entree(5, "faible", { prix: prixOk(-70, false) })).ecartPrix).toBeNull();
    expect(
      construireCarte(
        entree(5, "faible", { prix: { ...prixOk(-70), statut: "introuvable", comparaison: null } }),
      ).ecartPrix,
    ).toBeNull();
  });

  it.each([
    [-65, "−65 % vs prix d'occasion habituel"],
    [-72, "−70 % vs prix d'occasion habituel"],
    [-73, "−75 % vs prix d'occasion habituel"],
    [-100, "−100 % vs prix d'occasion habituel"],
    [-7, "−5 % vs prix d'occasion habituel"],
    [-2, "Prix dans la norme de l'occasion"],
    [0, "Prix dans la norme de l'occasion"],
    [2, "Prix dans la norme de l'occasion"],
    [12, "+10 % vs prix d'occasion habituel"],
    [48, "+50 % vs prix d'occasion habituel"],
  ])("écart %i %% → « %s » (arrondi à 5 %)", (ecart, attendu) => {
    expect(libelleEcartPrix(ecart)).toBe(attendu);
  });

  it("n'affiche jamais le prix de l'annonce, ni celui du marché", () => {
    const c = construireCarte(entree(30, "moyen", { prix: prixOk(-65) }));
    const texte = JSON.stringify(c);
    expect(texte).not.toMatch(/250|900|€/);
  });
});

describe("hotePartage", () => {
  it.each([
    [undefined, HOTE_PAR_DEFAUT],
    ["", HOTE_PAR_DEFAUT],
    ["   ", HOTE_PAR_DEFAUT],
    ["pas une url", HOTE_PAR_DEFAUT],
    ["javascript:alert(1)", HOTE_PAR_DEFAUT],
    ["ftp://exemple.fr", HOTE_PAR_DEFAUT],
    ["https://gardo.app", "gardo.app"],
    ["https://gardo.app/", "gardo.app"],
    ["https://www.gardo.app/chemin?x=1#y", "www.gardo.app"],
    ["http://localhost:3000", "localhost:3000"],
  ])("%j → %s", (brut, attendu) => {
    expect(hotePartage(brut)).toBe(attendu);
  });

  it("l'adresse par défaut est celle de la production", () => {
    expect(HOTE_PAR_DEFAUT).toBe("v1-scan.vercel.app");
  });
});

describe("confidentialité : rien de l'analyse ne passe dans la carte", () => {
  const hostile = entree(77, "élevé", {
    plateforme: "vinted",
    prix: prixOk(-61),
    signaux: [
      signal("ia.1", "critique" as never, `${PSEUDO} demande ton IBAN`, "ia"),
      signal("ia.2", "importante", `Écris à ${PSEUDO}@mail.fr pour payer ${PRIX_EXACT}`, "ia"),
      signal("lien.imitation_marque", "importante", `Le lien « ${DOMAINE} » imite Vinted.`),
      signal("prix.tres_bas", "importante", `Le prix de ${PRIX_EXACT} est très bas.`),
      signal("plateforme.whatsapp", "importante", `Contacte ${PSEUDO} sur WhatsApp`),
    ],
    rassurants: [
      rassurant("ia.rassurant.1", `${PSEUDO} a 4,9/5`, "ia"),
      rassurant("profil.nombreux_avis", `${PSEUDO} a 320 avis`),
    ],
  });

  it("ni pseudo, ni domaine, ni prix exact dans les données de la carte", () => {
    const texte = JSON.stringify(construireCarte(hostile));
    for (const interdit of [
      PSEUDO,
      "marie",
      "dupont",
      DOMAINE,
      "paypa1",
      PRIX_EXACT,
      "320",
      "IBAN",
      "@",
    ]) {
      expect(texte).not.toContain(interdit);
    }
  });

  it("la carte n'a que des champs connus : pas de capture, pas de texte libre", () => {
    expect(Object.keys(construireCarte(hostile)).sort()).toEqual([
      "accroche",
      "autres",
      "ecartPrix",
      "hote",
      "mention",
      "niveau",
      "rassurant",
      "score",
      "signaux",
      "site",
      "titreNiveau",
    ]);
  });
});

describe("textes de la carte", () => {
  const cartes = [
    construireCarte(entree(12, "faible", { plateforme: "vinted" })),
    construireCarte(entree(45, "moyen", { site: "leboncoin", prix: prixOk(-58) })),
    construireCarte(entreeChargee()),
    construireCarte(entree(40, "moyen", { prix: prixOk(30) })),
  ];

  it("passent par le garde-fou de wording (ni accusation, ni promesse de sécurité)", () => {
    for (const c of cartes) {
      const textes = [
        c.titreNiveau,
        c.accroche,
        c.mention,
        c.site,
        c.ecartPrix,
        c.rassurant,
        ...c.signaux.map((s) => s.texte),
      ].filter((t): t is string => typeof t === "string");
      for (const t of textes) expect(trouverFormulationsInterdites(t), t).toEqual([]);
    }
  });

  it("toutes les phrases des catalogues passent le garde-fou, et sont courtes", () => {
    const phrases = [
      ...Object.values(fr.partage.signaux),
      ...Object.values(fr.partage.signauxNuances),
      ...Object.values(fr.partage.rassurants),
      ...Object.values(fr.partage.signalParGravite),
      ...Object.values(fr.partage.sansSignal),
    ];
    for (const p of phrases) {
      expect(trouverFormulationsInterdites(p), p).toEqual([]);
      expect(p.length, p).toBeLessThanOrEqual(62);
    }
  });

  it("ne mentionnent aucun nom de personne ni promesse : « estimation » et « aide à la décision »", () => {
    expect(fr.partage.mention).toBe("Estimation, aide à la décision");
  });
});

describe("couverture : chaque règle a sa phrase dans la carte", () => {
  const racine = process.cwd();
  const fichiers = [
    ...readdirSync(`${racine}/src/lib/rules/catalog`).map((f) => `src/lib/rules/catalog/${f}`),
    "src/lib/rules/prix.ts",
    "src/lib/links/analyse.ts",
    "src/lib/prix/comparer.ts",
  ].filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const ids = new Set<string>();
  for (const f of fichiers) {
    const source = readFileSync(`${racine}/${f}`, "utf8");
    for (const m of source.matchAll(
      /"((?:plateforme|paiement|script|urgence|liens?|profil|annonce|prix)\.[a-z_]+)"/g,
    )) {
      if (m[1]) ids.add(m[1]);
    }
  }
  const connus = new Set([
    ...Object.keys(fr.partage.signaux),
    ...Object.keys(fr.partage.rassurants),
  ]);

  it("a trouvé les règles du code", () => {
    expect(ids.size).toBeGreaterThan(45);
    expect(ids.has("paiement.code_sms")).toBe(true);
    expect(ids.has("lien.typosquatting")).toBe(true);
    expect(ids.has("prix.web")).toBe(true);
  });

  it("chaque identifiant de règle a une phrase (sinon la carte afficherait la phrase de repli)", () => {
    const manquants = [...ids].filter((id) => !connus.has(id));
    expect(manquants).toEqual([]);
  });

  it("aucune phrase ne reste pour une règle qui n'existe plus", () => {
    const orphelines = [...connus].filter((id) => !ids.has(id));
    expect(orphelines).toEqual([]);
  });
});
