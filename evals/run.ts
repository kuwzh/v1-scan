/**
 * Évaluation de Gardo sur un jeu de conversations et de captures.
 *
 *   pnpm eval                       plan et coût estimé, AUCUN appel à l'API
 *   pnpm eval --regles-seules       règles seules sur les textes : gratuit, sans clé
 *   pnpm eval --run                 évaluation complète avec l'IA (appels payants)
 *   pnpm eval --run --only sains    seulement les conversations saines (faux positifs)
 *   pnpm eval --run --model claude-sonnet-5-5 --repeat 3
 *
 * La métrique principale est le taux de faux positifs sur les conversations saines : elle est
 * mesurée à part et affichée en premier. Le code de sortie est non nul si un objectif n'est pas
 * atteint (désactivable avec --sans-verdict).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { creerClientAnthropic, creerEvaluateurIa } from "../src/lib/ai/client";
import { lireConfigIa } from "../src/lib/ai/config";
import { PROMPT_SYSTEME } from "../src/lib/ai/prompt";
import { estimerCout } from "../src/lib/ai/tarifs";
import type { EvaluerIa, ImageEntree, TypeImage } from "../src/lib/ai/types";
import { analyserDemande } from "../src/lib/analyze/pipeline";
import {
  SEUILS_PAR_DEFAUT,
  agreger,
  formaterRapport,
  type SeuilsEval,
} from "../src/lib/eval/rapport";
import type { CasEval, SortieCas } from "../src/lib/eval/types";
import { DATE_EVAL, TOUS_LES_CAS } from "./dataset";

const ici = dirname(fileURLToPath(import.meta.url));

// --- Arguments ---------------------------------------------------------------------------

interface Options {
  run: boolean;
  reglesSeules: boolean;
  only: "tout" | "sains" | "suspects" | "images" | "textes";
  model?: string;
  effort?: string;
  repeat: number;
  concurrence: number;
  seuils: SeuilsEval;
  sansVerdict: boolean;
  sortie?: string;
}

function lireOptions(argv: string[]): Options {
  const o: Options = {
    run: false,
    reglesSeules: false,
    only: "tout",
    repeat: 1,
    concurrence: 3,
    seuils: { ...SEUILS_PAR_DEFAUT },
    sansVerdict: false,
  };
  const valeur = (i: number, nom: string): string => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`${nom} attend une valeur.`);
    return v;
  };
  const nombre = (i: number, nom: string): number => {
    const n = Number(valeur(i, nom));
    if (!Number.isFinite(n) || n < 0) throw new Error(`${nom} attend un nombre positif.`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--run":
        o.run = true;
        break;
      case "--regles-seules":
        o.reglesSeules = true;
        break;
      case "--sans-verdict":
        o.sansVerdict = true;
        break;
      case "--only": {
        const v = valeur(i++, a);
        if (!["sains", "suspects", "images", "textes"].includes(v))
          throw new Error("--only : sains, suspects, images ou textes.");
        o.only = v as Options["only"];
        break;
      }
      case "--model":
        o.model = valeur(i++, a);
        break;
      case "--effort":
        o.effort = valeur(i++, a);
        break;
      case "--repeat":
        o.repeat = Math.max(1, Math.round(nombre(i++, a)));
        break;
      case "--concurrence":
        o.concurrence = Math.max(1, Math.round(nombre(i++, a)));
        break;
      case "--max-fp":
        o.seuils.maxFauxPositifs = nombre(i++, a);
        break;
      case "--max-fp-severe":
        o.seuils.maxFauxPositifsSeveres = nombre(i++, a);
        break;
      case "--max-invention":
        o.seuils.maxInvention = nombre(i++, a);
        break;
      case "--min-detection":
        o.seuils.minDetection = nombre(i++, a);
        break;
      case "--sortie":
        o.sortie = valeur(i++, a);
        break;
      case undefined:
        break;
      default:
        throw new Error(`Option inconnue : ${a}`);
    }
  }
  return o;
}

// --- Cas à exécuter ----------------------------------------------------------------------

function filtrer(o: Options): CasEval[] {
  return TOUS_LES_CAS.filter((c) => {
    const estImage = (c.entree.images?.length ?? 0) > 0;
    if (o.only === "sains") return c.categorie === "sain";
    if (o.only === "suspects") return c.categorie === "suspect";
    if (o.only === "images") return estImage;
    if (o.only === "textes") return !estImage;
    return true;
  });
}

const TYPES: Record<string, TypeImage> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function chargerImages(c: CasEval): ImageEntree[] {
  return (c.entree.images ?? []).map((nom) => {
    const mediaType = TYPES[extname(nom).toLowerCase()];
    if (!mediaType) throw new Error(`Type d'image non géré : ${nom}`);
    return { mediaType, base64: readFileSync(join(ici, "images", nom)).toString("base64") };
  });
}

// --- Estimation du coût ------------------------------------------------------------------

/** Estimation grossière, pour décider avant de lancer. Le coût réel est mesuré et affiché ensuite. */
function estimerPlan(cas: readonly CasEval[], modele: string, repeat: number) {
  const parAppel = cas.map((c) => {
    const entree =
      PROMPT_SYSTEME.length / 3.2 +
      (c.entree.texte?.length ?? 0) / 3.5 +
      (c.entree.images?.length ?? 0) * 1500 +
      150;
    return { entree: Math.round(entree), sortie: 900, cacheLecture: 0, cacheEcriture: 0 };
  });
  const total = parAppel.reduce(
    (t, u) => ({ ...t, entree: t.entree + u.entree, sortie: t.sortie + u.sortie }),
    { entree: 0, sortie: 0, cacheLecture: 0, cacheEcriture: 0 },
  );
  const cout = estimerCout(modele, total);
  return { appels: cas.length * repeat, cout: cout === null ? null : cout * repeat, total };
}

// --- Exécution ---------------------------------------------------------------------------

async function executer(
  cas: CasEval,
  repetition: number,
  evaluerIa: EvaluerIa | null,
  reglesSeules: boolean,
): Promise<SortieCas> {
  const images = chargerImages(cas);
  // En règles seules, une capture ne peut pas être lue, et un cas qui exige l'IA n'a pas de sens.
  if (reglesSeules && (images.length > 0 || cas.exigeIa)) {
    return { cas, repetition, statut: "ignore" };
  }
  const r = await analyserDemande(
    { images, texte: cas.entree.texte ?? null },
    { evaluerIa, maintenant: () => new Date(`${DATE_EVAL}T12:00:00Z`) },
  );
  if (!r.ok)
    return { cas, repetition, statut: "erreur", erreur: r.code, ...(r.ia ? { ia: r.ia } : {}) };
  return {
    cas,
    repetition,
    statut: "analyse",
    resultat: r.resultat,
    ia: r.ia,
    ignorees: r.ignorees,
  };
}

async function pool<T, R>(
  elements: readonly T[],
  concurrence: number,
  f: (e: T, i: number) => Promise<R>,
): Promise<R[]> {
  const resultats = new Array<R>(elements.length);
  let suivant = 0;
  const travailleurs = Array.from({ length: Math.min(concurrence, elements.length) }, async () => {
    while (suivant < elements.length) {
      const i = suivant++;
      resultats[i] = await f(elements[i] as T, i);
    }
  });
  await Promise.all(travailleurs);
  return resultats;
}

async function main(): Promise<number> {
  try {
    process.loadEnvFile(join(ici, "..", ".env.local"));
  } catch {
    // Pas de .env.local : les variables viennent de l'environnement.
  }
  const o = lireOptions(process.argv.slice(2));
  const config = lireConfigIa({
    ...process.env,
    ...(o.model ? { ANTHROPIC_MODEL: o.model } : {}),
    ...(o.effort ? { ANTHROPIC_EFFORT: o.effort } : {}),
  });
  const cas = filtrer(o);
  const aExecuter = o.reglesSeules
    ? cas.filter((c) => !c.exigeIa && (c.entree.images?.length ?? 0) === 0)
    : cas;
  const plan = estimerPlan(aExecuter, config.model, o.repeat);

  const sains = aExecuter.filter((c) => c.categorie === "sain").length;
  console.log(
    `Jeu de données : ${cas.length} cas (${cas.filter((c) => c.categorie === "sain").length} sains, ${cas.filter((c) => c.categorie === "suspect").length} suspects, ${cas.filter((c) => (c.entree.images?.length ?? 0) > 0).length} avec capture)`,
  );

  if (o.reglesSeules) {
    console.log(
      `Mode : règles seules, sans IA et sans clé. ${aExecuter.length} cas exécutés (${sains} sains), les cas à capture ou exigeant l'IA sont ignorés.\n`,
    );
  } else if (!o.run) {
    console.log(`Modèle : ${config.model} (effort « ${config.effort} »)`);
    console.log(
      `${plan.appels} appel(s) à l'API prévu(s), coût estimé ≈ ${plan.cout === null ? "inconnu (tarif non répertorié)" : `${plan.cout.toFixed(3)} $`} (estimation grossière).`,
    );
    console.log("\nAucun appel n'a été fait. Pour lancer l'évaluation :  pnpm eval --run");
    console.log("Gratuit, sans clé :                                    pnpm eval --regles-seules");
    return 0;
  } else {
    if (!config.apiKey) {
      console.error(
        "ANTHROPIC_API_KEY manquante : renseigne-la dans .env.local ou l'environnement.",
      );
      return 2;
    }
    console.log(`Modèle : ${config.model} (effort « ${config.effort} »)`);
    console.log(
      `${plan.appels} appel(s) à l'API, coût estimé ≈ ${plan.cout === null ? "inconnu" : `${plan.cout.toFixed(3)} $`}.\n`,
    );
  }

  const evaluerIa = o.reglesSeules ? null : creerEvaluateurIa(creerClientAnthropic(config), config);
  const taches = aExecuter.flatMap((c) => Array.from({ length: o.repeat }, (_, r) => ({ c, r })));
  let fait = 0;
  const sorties = await pool(taches, o.concurrence, async ({ c, r }) => {
    const s = await executer(c, r, evaluerIa, o.reglesSeules);
    fait++;
    const etat =
      s.statut === "analyse"
        ? `${s.resultat?.niveau ?? "?"} (${s.resultat?.score ?? "?"})`
        : s.statut === "erreur"
          ? `erreur ${s.erreur}`
          : "ignoré";
    console.log(
      `[${String(fait).padStart(String(taches.length).length)}/${taches.length}] ${c.id.padEnd(46)} ${etat}`,
    );
    return s;
  });

  const rapport = agreger(
    sorties,
    {
      modele: o.reglesSeules ? "règles seules" : config.model,
      date: new Date().toISOString().slice(0, 10),
      mode: o.reglesSeules ? "regles_seules" : "ia",
      repetitions: o.repeat,
    },
    o.seuils,
  );
  console.log(`\n${formaterRapport(rapport)}`);

  const dossier = join(ici, "rapports");
  mkdirSync(dossier, { recursive: true });
  const fichier =
    o.sortie ??
    join(
      dossier,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${o.reglesSeules ? "regles" : config.model}.json`,
    );
  writeFileSync(fichier, JSON.stringify({ rapport, sorties }, null, 2));
  console.log(`\nRapport détaillé : ${fichier}`);

  if (o.sansVerdict) return 0;
  return rapport.portes.every((p) => p.ok) ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (erreur: unknown) => {
    console.error(erreur instanceof Error ? erreur.message : erreur);
    process.exit(2);
  },
);
