import { describe, expect, it } from "vitest";
import { ReponseModeleSchema, SCHEMA_REPONSE } from "./wire";
import { reponseModele } from "./test-utils";

type Noeud = Record<string, unknown>;
const schema: Noeud = SCHEMA_REPONSE;

/** Suit un `$ref` du schéma (les sous-schémas répétés sont factorisés dans `$defs`). */
function resoudre(noeud: unknown): Noeud {
  const n = noeud as Noeud;
  if (typeof n.$ref === "string") {
    const nom = n.$ref.replace("#/$defs/", "");
    return resoudre((schema.$defs as Record<string, Noeud>)[nom]);
  }
  return n;
}
const proprietes = (noeud: unknown) => (resoudre(noeud).properties ?? {}) as Record<string, Noeud>;
const sousChamp = (...chemin: string[]) =>
  chemin.reduce<Noeud>((n, cle) => resoudre(proprietes(n)[cle]), schema);

/** Mots-clés JSON Schema que l'API des sorties structurées accepte. */
const MOTS_CLES_SUPPORTES = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "anyOf",
  "allOf",
  "enum",
  "const",
  "$ref",
  "$defs",
  "description",
  "title",
]);

/** Parcourt le schéma en visitant chaque nœud de schéma (pas les noms de propriétés). */
function tousLesNoeuds(noeud: Noeud, sortie: Noeud[] = []): Noeud[] {
  sortie.push(noeud);
  for (const sous of Object.values((noeud.properties ?? {}) as Noeud))
    tousLesNoeuds(sous as Noeud, sortie);
  if (noeud.items) tousLesNoeuds(noeud.items as Noeud, sortie);
  for (const cle of ["anyOf", "allOf"]) {
    for (const sous of (noeud[cle] ?? []) as Noeud[]) tousLesNoeuds(sous, sortie);
  }
  for (const sous of Object.values((noeud.$defs ?? {}) as Noeud))
    tousLesNoeuds(sous as Noeud, sortie);
  return sortie;
}

const accepteNull = (noeud: unknown): boolean =>
  ((resoudre(noeud).anyOf ?? []) as Noeud[]).some((a) => resoudre(a).type === "null");

describe("schéma envoyé à l'API", () => {
  const noeuds = tousLesNoeuds(schema);

  it("tous les objets sont fermés et tous leurs champs requis (exigence des sorties structurées)", () => {
    const objets = noeuds.filter((n) => n.type === "object");
    expect(objets.length).toBeGreaterThanOrEqual(10);
    for (const o of objets) {
      expect(o.additionalProperties).toBe(false);
      expect([...((o.required ?? []) as string[])].sort()).toEqual(
        Object.keys((o.properties ?? {}) as Noeud).sort(),
      );
    }
  });

  it("n'emploie que des mots-clés que l'API supporte (ni bornes, ni longueurs, ni $schema)", () => {
    expect(schema).not.toHaveProperty("$schema");
    for (const n of noeuds) {
      for (const cle of Object.keys(n)) {
        expect(MOTS_CLES_SUPPORTES.has(cle), `mot-clé non supporté : ${cle}`).toBe(true);
      }
    }
  });

  it("n'emploie aucun $ref (un $ref avec description voisine est ambigu pour l'API)", () => {
    expect(JSON.stringify(schema)).not.toContain("$ref");
    expect(JSON.stringify(schema)).not.toContain("$defs");
  });

  it("n'emploie aucun type en tableau : les valeurs nullables passent par anyOf", () => {
    for (const n of noeuds) expect(Array.isArray(n.type)).toBe(false);
  });

  it("garde les enum comme enum : les valeurs fermées sont imposées par l'API, pas seulement décrites", () => {
    const toutesLesEnum = noeuds.filter((n) => Array.isArray(n.enum));
    expect(toutesLesEnum.length).toBeGreaterThanOrEqual(5);
    // Aucune description ne doit contenir un enum recopié en texte (symptôme de zodOutputFormat).
    for (const n of noeuds) expect(String(n.description ?? "")).not.toContain("{enum:");
  });

  it("demande d'abord si le contenu est exploitable, puis les données avant l'évaluation", () => {
    expect(Object.keys(proprietes(schema))).toEqual([
      "contenu_exploitable",
      "donnees_extraites",
      "score",
      "niveau",
      "signaux",
      "rassurants",
      "conseils",
    ]);
  });

  it("les données non visibles peuvent être null, et leur confiance aussi", () => {
    const annonce = sousChamp("donnees_extraites", "annonce");
    const vendeur = sousChamp("donnees_extraites", "vendeur");
    expect(accepteNull(proprietes(annonce).prix_eur)).toBe(true);
    expect(accepteNull(proprietes(vendeur).nombre_avis)).toBe(true);
    expect(accepteNull(proprietes(vendeur).anciennete_jours)).toBe(true);
    expect(accepteNull(proprietes(vendeur).note_sur_5)).toBe(true);
    const confVendeur = sousChamp("donnees_extraites", "confiance", "vendeur");
    expect(accepteNull(proprietes(confVendeur).nombre_avis)).toBe(true);
    expect(accepteNull(proprietes(confVendeur).anciennete_jours)).toBe(true);
  });

  it("rappelle au plus près de chaque donnée qu'il faut mettre null si ce n'est pas visible", () => {
    const annonce = proprietes(sousChamp("donnees_extraites", "annonce"));
    const vendeur = proprietes(sousChamp("donnees_extraites", "vendeur"));
    for (const champ of [
      annonce.prix_eur,
      vendeur.anciennete_jours,
      vendeur.nombre_avis,
      vendeur.note_sur_5,
    ]) {
      expect(String(champ?.description)).toContain("null");
    }
  });

  it("n'autorise pas la gravité « critique » pour l'IA", () => {
    const gravite = resoudre(proprietes(resoudre(sousChamp("signaux").items)).gravite);
    expect(gravite.enum).toEqual(["info", "attention", "importante"]);
  });

  it("chaque message porte un auteur et une confiance parmi des valeurs fermées", () => {
    const message = proprietes(resoudre(sousChamp("donnees_extraites", "messages").items));
    expect(resoudre(message.confiance).enum).toEqual(["haute", "moyenne", "basse"]);
    expect(resoudre(message.auteur).enum).toEqual(["vendeur", "acheteur", "inconnu"]);
  });
});

describe("ReponseModeleSchema", () => {
  it("accepte une réponse valide", () => {
    expect(ReponseModeleSchema.safeParse(reponseModele()).success).toBe(true);
  });

  it("refuse une gravité « critique » de l'IA", () => {
    const r = reponseModele({ signaux: [{ label: "x", gravite: "critique" as never }] });
    expect(ReponseModeleSchema.safeParse(r).success).toBe(false);
  });

  it("refuse une confiance inconnue et un auteur hors du vocabulaire", () => {
    const r = reponseModele();
    r.donnees_extraites.messages = [
      { auteur: "vendeur", confiance: "certaine" as never, texte: "x" },
    ];
    expect(ReponseModeleSchema.safeParse(r).success).toBe(false);
    r.donnees_extraites.messages = [{ auteur: "moi" as never, confiance: "haute", texte: "x" }];
    expect(ReponseModeleSchema.safeParse(r).success).toBe(false);
  });
});
