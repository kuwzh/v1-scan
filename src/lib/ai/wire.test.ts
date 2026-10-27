import { describe, expect, it } from "vitest";
import { LIMITES_API, UNIONS_RECOMMANDEES, verifierSchema } from "./schema-limites";
import {
  CONFIANCES_API,
  PLATEFORMES_API,
  ReponseApiSchema,
  ReponseModeleSchema,
  SCHEMA_REPONSE,
  depuisReponseApi,
} from "./wire";
import { reponseModele, versReponseApi } from "./test-utils";

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

  it("aucune donnée n'est nullable : une donnée absente se dit par la confiance « aucune »", () => {
    const annonce = sousChamp("donnees_extraites", "annonce");
    const vendeur = sousChamp("donnees_extraites", "vendeur");
    for (const champ of Object.values(proprietes(annonce))) expect(accepteNull(champ)).toBe(false);
    for (const champ of Object.values(proprietes(vendeur))) expect(accepteNull(champ)).toBe(false);
    const confVendeur = sousChamp("donnees_extraites", "confiance", "vendeur");
    for (const champ of Object.values(proprietes(confVendeur))) {
      expect(accepteNull(champ)).toBe(false);
      expect(resoudre(champ).enum).toEqual([...CONFIANCES_API]);
    }
    expect(resoudre(proprietes(sousChamp("donnees_extraites")).plateforme).enum).toEqual([
      ...PLATEFORMES_API,
    ]);
  });

  it("rappelle au plus près de chaque donnée comment dire qu'elle est absente", () => {
    const annonce = proprietes(sousChamp("donnees_extraites", "annonce"));
    const vendeur = proprietes(sousChamp("donnees_extraites", "vendeur"));
    for (const champ of [
      annonce.titre,
      annonce.prix_eur,
      vendeur.anciennete_jours,
      vendeur.nombre_avis,
      vendeur.note_sur_5,
    ]) {
      expect(String(champ?.description)).toContain("aucune");
    }
  });

  it("n'autorise pas la gravité « critique » pour l'IA", () => {
    const gravite = resoudre(proprietes(resoudre(sousChamp("signaux").items)).gravite);
    expect(gravite.enum).toEqual(["info", "attention", "importante"]);
  });

  it("chaque message porte un auteur et une confiance parmi des valeurs fermées (la confiance d'un message n'est jamais « aucune »)", () => {
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

describe("schéma envoyé à l'API : limites documentées (HTTP 400 sinon)", () => {
  const verification = verifierSchema(SCHEMA_REPONSE);

  it("respecte toutes les limites des sorties structurées d'Anthropic", () => {
    expect(verification.violations).toEqual([]);
  });

  it(`n'a aucune union : la limite est de ${LIMITES_API.unions} et les ${25} champs nullables de la première version l'ont dépassée`, () => {
    expect(verification.stats.unions).toBeLessThanOrEqual(UNIONS_RECOMMANDEES);
    expect(verification.stats.unions).toBe(0);
  });

  it("n'a aucun paramètre optionnel (tout est requis)", () => {
    expect(verification.stats.optionnels).toBe(0);
  });

  it("reste de taille raisonnable (la grammaire compilée croît avec le schéma)", () => {
    expect(verification.stats.tailleOctets).toBeLessThan(12_000);
    expect(verification.stats.objets).toBeGreaterThanOrEqual(10);
  });
});

describe("ReponseApiSchema et depuisReponseApi", () => {
  it("accepte la réponse de l'API, sous la forme sans null", () => {
    expect(ReponseApiSchema.safeParse(versReponseApi(reponseModele())).success).toBe(true);
  });

  it("refuse un null : l'API n'en renvoie pas, et il masquerait une donnée absente", () => {
    const r = versReponseApi(reponseModele());
    (r.donnees_extraites.annonce as Record<string, unknown>).prix_eur = null;
    expect(ReponseApiSchema.safeParse(r).success).toBe(false);
  });

  it("refuse une confiance inconnue, une gravité « critique » et un score non numérique", () => {
    const base = versReponseApi(reponseModele());
    expect(ReponseApiSchema.safeParse({ ...base, score: "très élevé" }).success).toBe(false);
    expect(
      ReponseApiSchema.safeParse({
        ...base,
        signaux: [{ label: "x", gravite: "critique" }],
      }).success,
    ).toBe(false);
    const confiance = structuredClone(base);
    (confiance.donnees_extraites.confiance.vendeur as Record<string, unknown>).nombre_avis =
      "certaine";
    expect(ReponseApiSchema.safeParse(confiance).success).toBe(false);
  });

  it("aller-retour : la réponse interne est retrouvée à l'identique", () => {
    const interne = reponseModele();
    expect(depuisReponseApi(versReponseApi(interne))).toEqual(interne);
  });

  it("modèle et état : lus quand ils sont écrits, null (confiance « aucune ») sinon", () => {
    const interne = reponseModele();
    interne.donnees_extraites.annonce.modele = "Speedy 30";
    interne.donnees_extraites.confiance.annonce.modele = "haute";
    const api = versReponseApi(interne);
    expect(api.donnees_extraites.annonce.modele).toBe("Speedy 30");
    expect(api.donnees_extraites.annonce.etat).toBe("");
    expect(api.donnees_extraites.confiance.annonce.etat).toBe("aucune");
    const retour = depuisReponseApi(api).donnees_extraites;
    expect(retour.annonce.modele).toBe("Speedy 30");
    expect(retour.confiance.annonce.modele).toBe("haute");
    expect(retour.annonce.etat).toBeNull();
    expect(retour.confiance.annonce.etat).toBeNull();
  });

  it("« aucune » redevient null, valeur neutre comprise : 0 avis lu n'est pas un nombre d'avis inconnu", () => {
    const interne = reponseModele();
    interne.donnees_extraites.vendeur.nombre_avis = 0;
    interne.donnees_extraites.confiance.vendeur.nombre_avis = "haute";
    interne.donnees_extraites.vendeur.anciennete_jours = null;
    interne.donnees_extraites.confiance.vendeur.anciennete_jours = null;
    const retour = depuisReponseApi(versReponseApi(interne)).donnees_extraites;
    expect(retour.vendeur.nombre_avis).toBe(0);
    expect(retour.confiance.vendeur.nombre_avis).toBe("haute");
    expect(retour.vendeur.anciennete_jours).toBeNull();
    expect(retour.confiance.vendeur.anciennete_jours).toBeNull();
  });

  it("une valeur renvoyée malgré la confiance « aucune » est ignorée", () => {
    const api = versReponseApi(reponseModele());
    api.donnees_extraites.annonce.prix_eur = 4500;
    api.donnees_extraites.confiance.annonce.prix_eur = "aucune";
    const d = depuisReponseApi(api).donnees_extraites;
    expect(d.annonce.prix_eur).toBeNull();
    expect(d.confiance.annonce.prix_eur).toBeNull();
  });

  it("une chaîne vide ou un nombre illisible n'est pas une valeur, même avec une confiance", () => {
    const api = versReponseApi(reponseModele());
    api.donnees_extraites.annonce.marque = "   ";
    api.donnees_extraites.confiance.annonce.marque = "haute";
    api.donnees_extraites.vendeur.note_sur_5 = Number.NaN;
    api.donnees_extraites.confiance.vendeur.note_sur_5 = "haute";
    const d = depuisReponseApi(api).donnees_extraites;
    expect(d.annonce.marque).toBeNull();
    expect(d.confiance.annonce.marque).toBeNull();
    expect(d.vendeur.note_sur_5).toBeNull();
    expect(d.confiance.vendeur.note_sur_5).toBeNull();
  });

  it("la plateforme « inconnue » redevient null, les autres sont gardées", () => {
    const api = versReponseApi(reponseModele());
    api.donnees_extraites.plateforme = "inconnue";
    expect(depuisReponseApi(api).donnees_extraites.plateforme).toBeNull();
    api.donnees_extraites.plateforme = "leboncoin";
    expect(depuisReponseApi(api).donnees_extraites.plateforme).toBe("leboncoin");
  });

  it("le profil vérifié : false avec la confiance « aucune » est inconnu, pas « non vérifié »", () => {
    const api = versReponseApi(reponseModele());
    api.donnees_extraites.vendeur.profil_verifie = false;
    api.donnees_extraites.confiance.vendeur.profil_verifie = "aucune";
    expect(depuisReponseApi(api).donnees_extraites.vendeur.profil_verifie).toBeNull();
    api.donnees_extraites.confiance.vendeur.profil_verifie = "haute";
    expect(depuisReponseApi(api).donnees_extraites.vendeur.profil_verifie).toBe(false);
  });

  it("le résultat de la conversion respecte la forme interne", () => {
    expect(
      ReponseModeleSchema.safeParse(depuisReponseApi(versReponseApi(reponseModele()))).success,
    ).toBe(true);
  });
});
