import { describe, expect, it } from "vitest";
import { LIMITES_API, verifierSchema } from "./schema-limites";

const objet = (proprietes: Record<string, unknown>, requis = Object.keys(proprietes)) => ({
  type: "object",
  properties: proprietes,
  required: requis,
  additionalProperties: false,
});
const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] });
const champsNullables = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, nullable("string")]));

describe("verifierSchema : limites documentées des sorties structurées", () => {
  it("accepte un schéma simple et compte ses objets", () => {
    const v = verifierSchema(
      objet({
        a: { type: "string" },
        b: { type: "array", items: objet({ c: { type: "number" } }) },
      }),
    );
    expect(v.violations).toEqual([]);
    expect(v.stats).toMatchObject({ objets: 2, unions: 0, optionnels: 0 });
  });

  it(`${LIMITES_API.unions} unions passent, ${LIMITES_API.unions + 1} sont refusées`, () => {
    expect(verifierSchema(objet(champsNullables(LIMITES_API.unions))).violations).toEqual([]);
    const v = verifierSchema(objet(champsNullables(LIMITES_API.unions + 1)));
    expect(v.violations.join(" ")).toMatch(/17 paramètres avec union.*16 au plus/);
  });

  it("le schéma de la première version (25 champs nullables) est refusé : c'était la cause du HTTP 400", () => {
    const v = verifierSchema(objet(champsNullables(25)));
    expect(v.stats.unions).toBe(25);
    expect(v.violations.length).toBeGreaterThan(0);
  });

  it("compte aussi les types en tableau, les unions imbriquées et celles des éléments de tableau", () => {
    const v = verifierSchema(
      objet({
        a: { type: ["string", "null"] },
        b: objet({ c: nullable("number") }),
        d: { type: "array", items: nullable("string") },
      }),
    );
    expect(v.stats.unions).toBe(3);
  });

  it(`${LIMITES_API.optionnels + 1} paramètres optionnels sont refusés`, () => {
    const proprietes = Object.fromEntries(
      Array.from({ length: LIMITES_API.optionnels + 1 }, (_, i) => [`c${i}`, { type: "string" }]),
    );
    const v = verifierSchema(objet(proprietes, []));
    expect(v.stats.optionnels).toBe(25);
    expect(v.violations.join(" ")).toMatch(/optionnels/);
  });

  it.each([
    ["minLength", { type: "string", minLength: 1 }],
    ["maxLength", { type: "string", maxLength: 10 }],
    ["pattern", { type: "string", pattern: "^a+$" }],
    ["minimum", { type: "number", minimum: 0 }],
    ["maximum", { type: "number", maximum: 100 }],
    ["multipleOf", { type: "number", multipleOf: 5 }],
    ["maxItems", { type: "array", items: { type: "string" }, maxItems: 3 }],
    ["uniqueItems", { type: "array", items: { type: "string" }, uniqueItems: true }],
    ["exclusiveMinimum", { type: "number", exclusiveMinimum: 0 }],
  ])("refuse %s", (mot, schema) => {
    const v = verifierSchema(objet({ a: schema }));
    expect(v.violations.join(" ")).toContain(`« ${mot} »`);
  });

  it("minItems : 0 et 1 passent, 2 est refusé", () => {
    const tableau = (minItems: number) =>
      objet({ a: { type: "array", items: { type: "string" }, minItems } });
    expect(verifierSchema(tableau(0)).violations).toEqual([]);
    expect(verifierSchema(tableau(1)).violations).toEqual([]);
    expect(verifierSchema(tableau(2)).violations.join(" ")).toMatch(/minItems/);
  });

  it("exige additionalProperties: false sur chaque objet, y compris imbriqué", () => {
    expect(
      verifierSchema({ type: "object", properties: {}, required: [] }).violations.join(" "),
    ).toMatch(/additionalProperties doit valoir false/);
    const imbrique = objet({
      a: { type: "object", properties: {}, required: [], additionalProperties: true },
    });
    expect(verifierSchema(imbrique).violations.join(" ")).toMatch(/\$\.a : additionalProperties/);
  });

  it("refuse un format inconnu, accepte ceux de la liste", () => {
    expect(
      verifierSchema(objet({ a: { type: "string", format: "date-time" } })).violations,
    ).toEqual([]);
    expect(
      verifierSchema(objet({ a: { type: "string", format: "regex" } })).violations.join(" "),
    ).toMatch(/format « regex »/);
  });

  it("refuse un enum de valeurs complexes et un $ref externe", () => {
    expect(verifierSchema(objet({ a: { enum: [{ x: 1 }] } })).violations.join(" ")).toMatch(
      /enum de valeurs complexes/,
    );
    expect(
      verifierSchema(objet({ a: { $ref: "http://exemple.fr/schema.json" } })).violations.join(" "),
    ).toMatch(/\$ref externe/);
  });

  it("accepte description, title, default, const, enum simple, allOf", () => {
    const v = verifierSchema(
      objet({
        a: { type: "string", description: "d", title: "t", default: "x" },
        b: { const: "x" },
        c: { type: "string", enum: ["a", "b"] },
        d: { allOf: [{ type: "string" }] },
      }),
    );
    expect(v.violations).toEqual([]);
    expect(v.stats.enums).toBe(1);
  });
});
