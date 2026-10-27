import { describe, expect, it } from "vitest";
import { construireCarte, type DonneesCarte } from "./carte";
import {
  COULEURS,
  HAUTEUR,
  LARGEUR,
  decouperLignes,
  dessinerCarte,
  type Contexte2D,
  type Mesure,
} from "./dessin";
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

interface TexteDessine {
  texte: string;
  x: number;
  y: number;
  taille: number;
  align: string;
  couleur: unknown;
}

/**
 * Faux contexte 2D : note le texte dessiné et les membres utilisés. Largeur d'un caractère en em :
 * 0,4 (étroit : pas de retour à la ligne, pour lire les textes) ou 0,56 (pessimiste, comme une
 * police grasse : pour vérifier que tout tient).
 */
function faux(largeurEm = 0.4) {
  const textes: TexteDessine[] = [];
  const membres = new Set<string>();
  const etat = {
    fillStyle: "" as unknown,
    strokeStyle: "" as unknown,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "10px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
  };
  const taille = () => Number(/(\d+)px/.exec(etat.font)?.[1] ?? 10);
  const degrade = () => ({ addColorStop: () => undefined });
  const methodes: Record<string, (...a: never[]) => unknown> = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arcTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    createLinearGradient: degrade,
    createRadialGradient: degrade,
    measureText: ((t: string) => ({ width: t.length * taille() * largeurEm })) as never,
    fillText: ((texte: string, x: number, y: number) => {
      textes.push({
        texte,
        x,
        y,
        taille: taille(),
        align: etat.textAlign,
        couleur: etat.fillStyle,
      });
    }) as never,
  };
  const ctx = new Proxy(etat, {
    get(cible, cle: string) {
      membres.add(cle);
      return cle in methodes ? methodes[cle] : (cible as Record<string, unknown>)[cle];
    },
    set(cible, cle: string, valeur) {
      membres.add(cle);
      (cible as Record<string, unknown>)[cle] = valeur;
      return true;
    },
  }) as unknown as Contexte2D;
  return { ctx, textes, membres };
}

const PESSIMISTE = 0.56;
const dessiner = (donnees: DonneesCarte, largeurEm?: number) => {
  const f = faux(largeurEm);
  const mesures = dessinerCarte(f.ctx, donnees);
  return { ...f, mesures };
};

describe("dessinerCarte : texte affiché", () => {
  it("score faible : logo, adresse, jauge, rassurant, accroche, mention", () => {
    const { textes } = dessiner(
      construireCarte(
        entree(12, "faible", {
          plateforme: "vinted",
          rassurants: [rassurant("profil.compte_ancien")],
        }),
      ),
    );
    expect(textes.map((t) => t.texte)).toEqual([
      "Gardo",
      "v1-scan.vercel.app",
      "12",
      "sur 100",
      "Risque faible",
      "Annonce Vinted",
      "Peu de signaux d'alerte repérés.",
      "Le compte existe depuis longtemps.",
      "Vérifie tes annonces avant de payer",
      "→ v1-scan.vercel.app",
      "Estimation, aide à la décision",
    ]);
  });

  it("score moyen : pastilles site et prix, trois signaux, décompte du reste", () => {
    const { textes } = dessiner(
      construireCarte(
        entree(45, "moyen", {
          site: "leboncoin",
          prix: prixOk(-58),
          signaux: [
            signal("plateforme.whatsapp", "importante"),
            signal("paiement.virement", "attention"),
            signal("urgence.forte", "attention"),
            signal("profil.compte_recent", "attention"),
          ],
        }),
      ),
    );
    expect(textes.map((t) => t.texte)).toEqual([
      "Gardo",
      "v1-scan.vercel.app",
      "45",
      "sur 100",
      "Risque moyen",
      "Annonce Leboncoin",
      "−60 % vs prix d'occasion habituel",
      "On te propose de passer sur WhatsApp.",
      "Un paiement par virement est évoqué.",
      "On te met la pression pour aller vite.",
      "+ 1 autre signal",
      "Vérifie tes annonces avant de payer",
      "→ v1-scan.vercel.app",
      "Estimation, aide à la décision",
    ]);
  });

  it("score élevé : couleurs du niveau (rouge) pour le titre", () => {
    const { textes } = dessiner(construireCarte(entreeChargee()));
    const titre = textes.find((t) => t.texte === "Risque élevé");
    expect(titre?.couleur).toBe(COULEURS.niveau.élevé);
    expect(textes.find((t) => t.texte === "88")).toBeDefined();
  });

  it.each([
    ["faible", COULEURS.niveau.faible],
    ["moyen", COULEURS.niveau.moyen],
    ["élevé", COULEURS.niveau.élevé],
  ] as const)("le titre du niveau %s a la couleur de l'app", (niveau, couleur) => {
    const { textes } = dessiner(construireCarte(entree(50, niveau)));
    expect(textes.find((t) => t.texte.startsWith("Risque"))?.couleur).toBe(couleur);
  });

  it("les couleurs sont celles de globals.css (vert, orange, rouge de l'app)", () => {
    expect(COULEURS.niveau).toEqual({ faible: "#3fc168", moyen: "#f7a224", élevé: "#f1383e" });
  });
});

describe("dessinerCarte : confidentialité", () => {
  const hostile = construireCarte(
    entree(77, "élevé", {
      plateforme: "vinted",
      prix: prixOk(-61),
      signaux: [
        signal("ia.1", "importante", `${PSEUDO} demande ton IBAN`, "ia"),
        signal("lien.imitation_marque", "importante", `Le lien « ${DOMAINE} » imite Vinted.`),
        signal("prix.tres_bas", "importante", `Le prix de ${PRIX_EXACT} est très bas.`),
        signal("plateforme.whatsapp", "importante", `Contacte ${PSEUDO}`),
      ],
      rassurants: [rassurant("profil.nombreux_avis", `${PSEUDO} a 320 avis`)],
    }),
  );

  it("aucun pseudo, domaine ni prix exact dans le texte dessiné", () => {
    const { textes } = dessiner(hostile);
    const tout = textes.map((t) => t.texte).join(" | ");
    for (const interdit of [PSEUDO, "marie", DOMAINE, "paypa1", PRIX_EXACT, "320", "IBAN", "@"]) {
      expect(tout).not.toContain(interdit);
    }
  });

  it("jamais d'image : drawImage et les fonctions de lecture de pixels ne sont pas touchées", () => {
    const { membres } = dessiner(hostile);
    for (const interdit of [
      "drawImage",
      "putImageData",
      "getImageData",
      "createPattern",
      "createImageData",
    ]) {
      expect(membres.has(interdit)).toBe(false);
    }
  });

  it("ne dessine que du texte, des formes et des dégradés : liste fermée de membres", () => {
    const { membres } = dessiner(hostile);
    expect([...membres].sort()).toEqual(
      [
        "arc",
        "arcTo",
        "beginPath",
        "closePath",
        "createLinearGradient",
        "createRadialGradient",
        "fill",
        "fillRect",
        "fillStyle",
        "fillText",
        "font",
        "globalAlpha",
        "lineCap",
        "lineJoin",
        "lineWidth",
        "lineTo",
        "measureText",
        "moveTo",
        "restore",
        "save",
        "stroke",
        "strokeStyle",
        "textAlign",
        "textBaseline",
      ].sort(),
    );
  });
});

describe("dessinerCarte : mise en page", () => {
  const cas: Array<[string, DonneesCarte]> = [
    ["faible", construireCarte(entree(12, "faible", { plateforme: "vinted" }))],
    ["élevé chargé", construireCarte(entreeChargee())],
    [
      "adresse longue",
      {
        ...construireCarte(entreeChargee()),
        hote: "un-sous-domaine-vraiment-tres-long.exemple-de-site.fr",
      },
    ],
    [
      "score 100",
      construireCarte(entree(100, "élevé", { signaux: [signal("paiement.code_sms", "critique")] })),
    ],
    ["score 0", construireCarte(entree(0, "faible"))],
  ];

  it.each(cas)("%s : tout reste dans l'image (1080 × 1920)", (_nom, donnees) => {
    const { textes } = dessiner(donnees, PESSIMISTE);
    for (const t of textes) {
      const largeur = t.texte.length * t.taille * PESSIMISTE;
      const gauche =
        t.align === "center" ? t.x - largeur / 2 : t.align === "right" ? t.x - largeur : t.x;
      expect(gauche, t.texte).toBeGreaterThanOrEqual(0);
      expect(gauche + largeur, t.texte).toBeLessThanOrEqual(LARGEUR);
      expect(t.y, t.texte).toBeGreaterThan(0);
      expect(t.y, t.texte).toBeLessThan(HAUTEUR);
    }
  });

  it.each(cas)("%s : le contenu ne déborde pas sur l'accroche", (_nom, donnees) => {
    const { mesures } = dessiner(donnees, PESSIMISTE);
    expect(mesures.finContenu).toBeLessThanOrEqual(mesures.debutAccroche - 25);
  });

  it("le cas le plus chargé tient sans rien retirer : trois signaux, rassurant, pastilles, décompte", () => {
    const { textes, mesures } = dessiner(construireCarte(entreeChargee()), 0.5);
    const tout = textes.map((t) => t.texte).join(" ");
    expect(tout).toContain("+ 4 autres signaux");
    expect(tout).toContain("Le profil est vérifié par la plateforme.");
    expect(tout).not.toContain("…");
    expect(mesures.finContenu).toBeLessThanOrEqual(mesures.debutAccroche - 25);
  });

  it("si le contenu déborde, il se resserre (sans le décompte, puis une ligne par signal, puis sans rassurant) plutôt que de recouvrir l'accroche", () => {
    const long =
      "Un signal d'alerte volontairement très long qui prendrait plusieurs lignes à l'écran";
    const donnees: DonneesCarte = {
      ...construireCarte(entreeChargee()),
      signaux: [1, 2, 3].map(() => ({ texte: long, gravite: "importante" as const })),
      autres: 9,
      rassurant: "Un rassurant assez long pour occuper de la place à l'écran du téléphone",
    };
    const { mesures } = dessiner(donnees, PESSIMISTE);
    expect(mesures.finContenu).toBeLessThanOrEqual(mesures.debutAccroche - 25);
  });

  it("l'accroche et l'adresse tiennent dans le bouton, même avec une adresse très longue", () => {
    const { textes } = dessiner(
      {
        ...construireCarte(entree(30, "moyen")),
        hote: "un-sous-domaine-vraiment-tres-long.exemple-de-site-tres-long.fr",
      },
      PESSIMISTE,
    );
    const ligne = textes.find((t) => t.texte.startsWith("→"));
    expect(ligne?.texte.endsWith("…")).toBe(true);
    expect((ligne?.texte.length ?? 0) * (ligne?.taille ?? 0) * PESSIMISTE).toBeLessThanOrEqual(
      900 - 80,
    );
    const entete = textes.find((t) => t.align === "right");
    expect((entete?.texte.length ?? 0) * (entete?.taille ?? 0) * PESSIMISTE).toBeLessThanOrEqual(
      400,
    );
  });

  it("deux pastilles trop larges pour une ligne passent l'une sous l'autre", () => {
    const donnees: DonneesCarte = {
      ...construireCarte(
        entree(30, "moyen", { plateforme: "facebook_marketplace", prix: prixOk(-65) }),
      ),
      ecartPrix: "−65 % vs prix d'occasion habituel",
    };
    const { textes } = dessiner(donnees, 0.5);
    const site = textes.find((t) => t.texte === "Annonce Facebook Marketplace");
    const prix = textes.find((t) => t.texte.startsWith("−65"));
    expect(site && prix && prix.y > site.y).toBe(true);
  });
});

describe("decouperLignes", () => {
  const mesurer: Mesure = (t) => t.length * 10;

  it("retourne le texte tel quel quand il tient", () => {
    expect(decouperLignes("bonjour le monde", 400, mesurer, 3)).toEqual(["bonjour le monde"]);
  });

  it("coupe entre les mots, sans dépasser la largeur", () => {
    const lignes = decouperLignes("un deux trois quatre cinq six", 110, mesurer, 5);
    expect(lignes).toEqual(["un deux", "trois", "quatre cinq", "six"]);
    for (const l of lignes) expect(mesurer(l)).toBeLessThanOrEqual(110);
  });

  it("limite le nombre de lignes et termine par « … » en restant dans la largeur", () => {
    const lignes = decouperLignes("un deux trois quatre cinq six sept huit", 110, mesurer, 2);
    expect(lignes).toHaveLength(2);
    expect(lignes[1]?.endsWith("…")).toBe(true);
    expect(mesurer(lignes[1] ?? "")).toBeLessThanOrEqual(110);
  });

  it("coupe un mot plus long que la ligne", () => {
    const lignes = decouperLignes("abcdefghijklmnopqrstuvwxyz", 100, mesurer, 5);
    expect(lignes.join("")).toBe("abcdefghijklmnopqrstuvwxyz");
    for (const l of lignes) expect(mesurer(l)).toBeLessThanOrEqual(100);
  });

  it("texte vide : aucune ligne ; espaces multiples ignorés", () => {
    expect(decouperLignes("", 100, mesurer, 2)).toEqual([]);
    expect(decouperLignes("  a   b  ", 100, mesurer, 2)).toEqual(["a b"]);
  });
});
