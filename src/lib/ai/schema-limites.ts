/**
 * Vérifie un schéma JSON contre les limites DOCUMENTÉES des sorties structurées d'Anthropic
 * (`output_config.format`). Un schéma qui les dépasse est refusé par l'API avec un HTTP 400, sans
 * que rien ne le signale avant l'appel : ce contrôle le fait, en test et dans `pnpm check:anthropic`.
 *
 * Source : https://platform.claude.com/docs/en/build-with-claude/structured-outputs (limites vérifiées
 * le 27/10/2026) :
 * - types : object, array, string, integer, number, boolean, null ; enum de valeurs simples ;
 *   const ; anyOf ; allOf ; $ref / $defs sans récursion ; formats de chaîne listés ci-dessous ;
 *   `minItems` seulement 0 ou 1 ;
 * - interdits : bornes numériques, longueurs de chaîne, `additionalProperties` autre que `false`,
 *   récursion, `$ref` externe, motifs complexes ;
 * - complexité : 16 paramètres avec union (`anyOf` ou type en tableau) et 24 paramètres optionnels
 *   au plus ; au-delà, ou si la grammaire compilée est trop grosse, « Schema is too complex ».
 *
 * Le validateur est plus strict que l'API sur un point : il refuse `pattern`, dont la prise en
 * charge est partielle. La vraie validation des valeurs se fait côté serveur, avec zod.
 */
export const LIMITES_API = { unions: 16, optionnels: 24 } as const;

/** Marge de sécurité : la limite de 16 unions est suivie d'une compilation exponentielle. */
export const UNIONS_RECOMMANDEES = 8;

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
  "definitions",
  "description",
  "title",
  "default",
  "format",
  "minItems",
]);

const FORMATS_SUPPORTES = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

type Noeud = Record<string, unknown>;

export interface VerificationSchema {
  /** Ce que l'API refuserait. Vide : le schéma respecte les limites documentées. */
  violations: string[];
  stats: {
    objets: number;
    /** Paramètres (propriétés ou éléments de tableau) dont le schéma est un `anyOf` ou un type en tableau. */
    unions: number;
    /** Propriétés absentes de `required`. */
    optionnels: number;
    enums: number;
    tailleOctets: number;
  };
}

const estNoeud = (v: unknown): v is Noeud =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const aUneUnion = (n: Noeud) => Array.isArray(n.anyOf) || Array.isArray(n.type);

export function verifierSchema(schema: unknown): VerificationSchema {
  const violations: string[] = [];
  const stats = { objets: 0, unions: 0, optionnels: 0, enums: 0, tailleOctets: 0 };
  stats.tailleOctets = JSON.stringify(schema ?? null).length;

  function visiter(noeud: unknown, chemin: string, parametre: boolean): void {
    if (!estNoeud(noeud)) {
      violations.push(`${chemin} : le schéma n'est pas un objet`);
      return;
    }
    if (parametre && aUneUnion(noeud)) stats.unions++;

    for (const cle of Object.keys(noeud)) {
      if (!MOTS_CLES_SUPPORTES.has(cle)) {
        violations.push(`${chemin} : mot-clé « ${cle} » non supporté par l'API`);
      }
    }
    if (noeud.minItems !== undefined && noeud.minItems !== 0 && noeud.minItems !== 1) {
      violations.push(
        `${chemin} : minItems ne peut valoir que 0 ou 1 (reçu ${String(noeud.minItems)})`,
      );
    }
    if (typeof noeud.format === "string" && !FORMATS_SUPPORTES.has(noeud.format)) {
      violations.push(`${chemin} : format « ${noeud.format} » non supporté`);
    }
    if (typeof noeud.$ref === "string" && !noeud.$ref.startsWith("#")) {
      violations.push(`${chemin} : $ref externe non supporté`);
    }
    if (Array.isArray(noeud.enum)) {
      stats.enums++;
      if (noeud.enum.some((v) => typeof v === "object" && v !== null)) {
        violations.push(`${chemin} : enum de valeurs complexes non supporté`);
      }
    }

    if (noeud.type === "object" || estNoeud(noeud.properties)) {
      stats.objets++;
      if (noeud.additionalProperties !== false) {
        violations.push(`${chemin} : additionalProperties doit valoir false`);
      }
      const requis = new Set(Array.isArray(noeud.required) ? (noeud.required as string[]) : []);
      const proprietes = estNoeud(noeud.properties) ? noeud.properties : {};
      for (const [nom, sous] of Object.entries(proprietes)) {
        if (!requis.has(nom)) stats.optionnels++;
        visiter(sous, `${chemin}.${nom}`, true);
      }
    }
    if (noeud.items !== undefined) visiter(noeud.items, `${chemin}[]`, true);
    for (const cle of ["anyOf", "allOf"] as const) {
      const branches = noeud[cle];
      if (Array.isArray(branches))
        branches.forEach((b, i) => visiter(b, `${chemin}.${cle}[${i}]`, false));
    }
    for (const cle of ["$defs", "definitions"] as const) {
      const defs = noeud[cle];
      if (estNoeud(defs)) {
        for (const [nom, sous] of Object.entries(defs))
          visiter(sous, `${chemin}.${cle}.${nom}`, false);
      }
    }
  }

  visiter(schema, "$", false);

  if (stats.unions > LIMITES_API.unions) {
    violations.push(
      `${stats.unions} paramètres avec union (anyOf ou type en tableau, nullables compris) : l'API en accepte ${LIMITES_API.unions} au plus`,
    );
  }
  if (stats.optionnels > LIMITES_API.optionnels) {
    violations.push(
      `${stats.optionnels} paramètres optionnels : l'API en accepte ${LIMITES_API.optionnels} au plus`,
    );
  }
  return { violations, stats };
}
