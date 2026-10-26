import type { ExtractedData } from "../contracts/extracted";
import { fr } from "../copy/fr";
import { constat } from "./poids";
import { normaliserTexte } from "./texte";
import type { Constat } from "./types";

export interface ReferencePrix {
  id: string;
  /** Nom affiché dans le libellé. */
  nom: string;
  /** Marques reconnues (minuscules, sans accents). Liste vide : le produit suffit. */
  marques: readonly string[];
  /** Mots qui doivent aussi figurer dans l'annonce (modèle, type d'article). */
  produits?: readonly string[];
  /**
   * Prix d'occasion le plus bas qu'on voit raisonnablement pour un article authentique,
   * en euros. Ordre de grandeur volontairement prudent : un prix bien en dessous est
   * « inhabituel », pas « prouvé faux ». Données à ajuster avec le retour du terrain.
   */
  prixMin: number;
}

export const REFERENCES_PRIX: readonly ReferencePrix[] = [
  // Maroquinerie, mode, bijoux et montres de luxe
  {
    id: "louis-vuitton",
    nom: "Louis Vuitton",
    marques: ["louis vuitton", "louisvuitton"],
    prixMin: 150,
  },
  { id: "gucci", nom: "Gucci", marques: ["gucci"], prixMin: 120 },
  { id: "chanel", nom: "Chanel", marques: ["chanel"], prixMin: 150 },
  { id: "hermes", nom: "Hermès", marques: ["hermes"], prixMin: 200 },
  { id: "dior", nom: "Dior", marques: ["dior"], prixMin: 120 },
  { id: "prada", nom: "Prada", marques: ["prada"], prixMin: 120 },
  { id: "balenciaga", nom: "Balenciaga", marques: ["balenciaga"], prixMin: 120 },
  { id: "saint-laurent", nom: "Saint Laurent", marques: ["saint laurent"], prixMin: 120 },
  { id: "celine", nom: "Céline", marques: ["celine"], prixMin: 120 },
  { id: "fendi", nom: "Fendi", marques: ["fendi"], prixMin: 120 },
  { id: "bottega-veneta", nom: "Bottega Veneta", marques: ["bottega veneta"], prixMin: 150 },
  { id: "goyard", nom: "Goyard", marques: ["goyard"], prixMin: 200 },
  { id: "loewe", nom: "Loewe", marques: ["loewe"], prixMin: 120 },
  { id: "miu-miu", nom: "Miu Miu", marques: ["miu miu"], prixMin: 120 },
  { id: "givenchy", nom: "Givenchy", marques: ["givenchy"], prixMin: 80 },
  { id: "valentino", nom: "Valentino", marques: ["valentino"], prixMin: 80 },
  { id: "versace", nom: "Versace", marques: ["versace"], prixMin: 60 },
  { id: "jacquemus", nom: "Jacquemus", marques: ["jacquemus"], prixMin: 60 },
  { id: "burberry", nom: "Burberry", marques: ["burberry"], prixMin: 40 },
  { id: "moncler", nom: "Moncler", marques: ["moncler"], prixMin: 150 },
  { id: "canada-goose", nom: "Canada Goose", marques: ["canada goose"], prixMin: 150 },
  { id: "cartier", nom: "Cartier", marques: ["cartier"], prixMin: 200 },
  { id: "rolex", nom: "Rolex", marques: ["rolex"], prixMin: 1500 },
  {
    id: "omega",
    nom: "Omega",
    marques: ["omega"],
    produits: ["montre", "seamaster", "speedmaster", "constellation"],
    prixMin: 400,
  },
  { id: "tag-heuer", nom: "TAG Heuer", marques: ["tag heuer"], prixMin: 250 },
  // High-tech
  { id: "iphone", nom: "iPhone", marques: [], produits: ["iphone"], prixMin: 100 },
  { id: "macbook", nom: "MacBook", marques: [], produits: ["macbook"], prixMin: 250 },
  { id: "ipad", nom: "iPad", marques: [], produits: ["ipad"], prixMin: 80 },
  { id: "airpods", nom: "AirPods", marques: [], produits: ["airpods"], prixMin: 30 },
  { id: "apple-watch", nom: "Apple Watch", marques: [], produits: ["apple watch"], prixMin: 60 },
  {
    id: "ps5",
    nom: "PlayStation 5",
    marques: [],
    produits: ["ps5", "playstation 5"],
    prixMin: 180,
  },
  { id: "xbox-series", nom: "Xbox Series", marques: [], produits: ["xbox series"], prixMin: 150 },
  {
    id: "switch",
    nom: "Nintendo Switch",
    marques: ["nintendo"],
    produits: ["switch"],
    prixMin: 70,
  },
  {
    id: "dyson",
    nom: "Dyson",
    marques: ["dyson"],
    produits: [
      "aspirateur",
      "airwrap",
      "supersonic",
      "seche-cheveux",
      "v8",
      "v10",
      "v11",
      "v12",
      "v15",
    ],
    prixMin: 70,
  },
  { id: "gopro", nom: "GoPro", marques: ["gopro"], prixMin: 50 },
  // Sneakers et lunettes
  {
    id: "air-jordan",
    nom: "Air Jordan",
    marques: ["nike", "jordan"],
    produits: ["jordan"],
    prixMin: 50,
  },
  { id: "yeezy", nom: "Yeezy", marques: [], produits: ["yeezy"], prixMin: 60 },
  { id: "nike-dunk", nom: "Nike Dunk", marques: ["nike"], produits: ["dunk"], prixMin: 50 },
  { id: "ray-ban", nom: "Ray-Ban", marques: ["ray-ban", "rayban"], prixMin: 30 },
];

/**
 * Mots qui expliquent un prix bas sans rien de suspect : accessoire, pièce détachée, objet
 * en panne, lot, ou copie annoncée comme telle. Si l'annonce en contient un, on ne dit rien.
 */
const EXPLICATIONS_PRIX_BAS = new RegExp(
  String.raw`\b(?:coques?|housses?|etuis?|protections?|verre trempe|films?|cables?|chargeurs?|adaptateurs?|supports?|boites?|boitiers?|bracelets?|pochettes?|skins?|stickers?|autocollants?|facture|notice|vide|pour pieces?|pieces?|hs|casse\w*|fissure\w*|ne fonctionne pas|defectueu\w*|a reparer|en panne|icloud|verrouille\w*|lot de|imitation|replique|copie|dupe|inspire\w*|style|type|facon|ecrans?|batterie|vitre)\b`,
);

function contientMot(texte: string, mot: string): boolean {
  const echappe = mot.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return new RegExp(String.raw`(?:^|[^a-z0-9])${echappe}(?:$|[^a-z0-9])`).test(texte);
}

/** Cherche la référence de prix qui correspond à l'annonce, si elle en a une. */
export function trouverReferencePrix(annonce: ExtractedData["annonce"]): ReferencePrix | null {
  const texte = normaliserTexte(
    [annonce.marque, annonce.titre, annonce.categorie].filter(Boolean).join(" "),
  );
  if (texte.trim() === "") return null;
  for (const ref of REFERENCES_PRIX) {
    const marqueOk = ref.marques.length === 0 || ref.marques.some((m) => contientMot(texte, m));
    const produitOk = !ref.produits || ref.produits.some((p) => contientMot(texte, p));
    if (marqueOk && produitOk) return ref;
  }
  return null;
}

/** Prix anormalement bas pour une marque ou un modèle recherché. */
export function evaluerPrix(donnees: ExtractedData): Constat[] {
  const { annonce } = donnees;
  const prix = annonce.prix_eur;
  if (prix === null) return [];
  const ref = trouverReferencePrix(annonce);
  if (!ref) return [];

  const texteAnnonce = normaliserTexte(
    [annonce.titre, annonce.description, annonce.categorie].filter(Boolean).join(" "),
  );
  if (EXPLICATIONS_PRIX_BAS.test(texteAnnonce)) return [];

  const conseil = fr.conseilsRegles.prixBas;
  const rapport = prix / ref.prixMin;
  if (rapport < 0.2) {
    return [
      constat("prix.tres_bas", fr.regles.prix.tresBas(prix, ref.nom), "importante", 0.38, {
        conseil,
      }),
    ];
  }
  if (rapport < 0.4) {
    return [constat("prix.bas", fr.regles.prix.bas(prix, ref.nom), "attention", 0.22, { conseil })];
  }
  return [];
}
