/**
 * Vérifie l'accès à l'API d'Anthropic avec le VRAI schéma de sortie de Gardo, en local.
 *
 *   pnpm check:anthropic                  schéma (hors ligne) + un appel texte + un appel avec capture
 *   pnpm check:anthropic --sans-image     sans l'appel avec capture
 *   pnpm check:anthropic --hors-ligne     seulement la vérification du schéma : aucune clé, aucun appel
 *   pnpm check:anthropic --model claude-sonnet-5-5 --effort medium
 *   pnpm check:anthropic --image chemin/vers/capture.png
 *
 * La clé est lue dans ANTHROPIC_API_KEY (environnement, `.env.local` ou `.env`) ; elle n'est jamais
 * affichée. Coût : deux appels, de l'ordre du millième de dollar sur Haiku 5.5.
 *
 * Code de sortie : 0 tout va bien ; 1 le schéma ou un appel est refusé ; 2 la clé est absente.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { construireRequete, creerClientAnthropic, creerEvaluateurIa } from "../src/lib/ai/client";
import { EFFORTS, lireConfigIa, type Effort } from "../src/lib/ai/config";
import { LIMITES_API, verifierSchema } from "../src/lib/ai/schema-limites";
import { estimerCout } from "../src/lib/ai/tarifs";
import type { EvaluerIa, ImageEntree, ResultatIa, TypeImage } from "../src/lib/ai/types";
import { SCHEMA_REPONSE } from "../src/lib/ai/wire";

const racine = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Arguments et environnement ---------------------------------------------------------

interface Options {
  horsLigne: boolean;
  sansImage: boolean;
  model?: string;
  effort?: Effort;
  image: string;
}

function lireArguments(argv: string[]): Options {
  const options: Options = {
    horsLigne: false,
    sansImage: false,
    image: join(racine, "evals/images/conversation-suspecte.jpg"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hors-ligne") options.horsLigne = true;
    else if (a === "--sans-image") options.sansImage = true;
    else if (a === "--model") options.model = argv[++i];
    else if (a === "--effort") {
      const e = argv[++i] as Effort;
      if (!EFFORTS.includes(e)) sortir(`--effort doit valoir : ${EFFORTS.join(", ")}.`, 2);
      options.effort = e;
    } else if (a === "--image") options.image = resolve(argv[++i] ?? "");
    else sortir(`Argument inconnu : ${a}. Voir l'en-tête de scripts/check-anthropic.ts.`, 2);
  }
  return options;
}

/** `.env.local` puis `.env` : les variables déjà définies dans l'environnement ne sont pas écrasées. */
function chargerEnvironnement(): void {
  for (const fichier of [".env.local", ".env"]) {
    const chemin = join(racine, fichier);
    if (!existsSync(chemin)) continue;
    try {
      process.loadEnvFile(chemin);
    } catch {
      // Fichier illisible : on continue avec l'environnement du processus.
    }
  }
}

function sortir(message: string, code: number): never {
  console.error(message);
  process.exit(code);
}

// --- Affichage ----------------------------------------------------------------------------

const ok = (t: string) => console.log(`  ✓ ${t}`);
const ko = (t: string) => console.log(`  ✗ ${t}`);
const titre = (t: string) => console.log(`\n━━ ${t} ━━`);
const secondes = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const TYPES_IMAGE: Record<string, TypeImage> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function chargerImage(chemin: string): ImageEntree {
  const type = TYPES_IMAGE[extname(chemin).toLowerCase()];
  if (!type) sortir(`Format d'image non pris en charge : ${chemin} (jpg, png ou webp).`, 2);
  if (!existsSync(chemin)) sortir(`Image introuvable : ${chemin}`, 2);
  return { mediaType: type, base64: readFileSync(chemin).toString("base64") };
}

/** Un appel réel ; renvoie vrai s'il a réussi. */
async function appeler(
  nom: string,
  evaluer: EvaluerIa,
  modele: string,
  entree: Parameters<EvaluerIa>[0],
): Promise<boolean> {
  titre(nom);
  const r: ResultatIa = await evaluer(entree);
  if (!r.ok) {
    ko(`échec « ${r.raison} » après ${secondes(r.dureeMs)}`);
    console.log(`    détail : ${r.detail ?? "(aucun)"}`);
    if (r.usage)
      console.log(`    jetons facturés : ${r.usage.entree} en entrée, ${r.usage.sortie} en sortie`);
    return false;
  }
  const cout = estimerCout(modele, r.usage);
  ok(`réponse reçue et valide en ${secondes(r.dureeMs)}`);
  console.log(
    `    jetons : ${r.usage.entree} en entrée, ${r.usage.sortie} en sortie` +
      (r.usage.cacheLecture ? `, ${r.usage.cacheLecture} lus dans le cache` : "") +
      (cout === null ? "" : ` · coût estimé ≈ ${cout.toFixed(5)} $`),
  );
  const d = r.evaluation.donnees_extraites;
  console.log(
    `    contenu exploitable : ${r.evaluation.contenu_exploitable ? "oui" : "non"} · plateforme : ${d.plateforme ?? "inconnue"} · score IA : ${r.evaluation.score} (${r.evaluation.niveau})`,
  );
  console.log(`    messages transcrits : ${d.messages.length}`);
  for (const m of d.messages.slice(0, 12)) {
    console.log(
      `      [${m.auteur}, ${m.confiance}] ${m.texte.replace(/\s+/g, " ").slice(0, 110)}`,
    );
  }
  if (d.messages.length > 12) console.log(`      … (${d.messages.length - 12} de plus)`);
  if (d.liens.length > 0) console.log(`    liens : ${d.liens.join(", ")}`);
  const a = r.avertissements;
  if (a.messagesEcartes + a.liensEcartes + a.valeursInvalides.length > 0) {
    console.log(
      `    ⚠ nettoyage : ${a.messagesEcartes} message(s) et ${a.liensEcartes} lien(s) écartés, valeurs invalides : ${a.valeursInvalides.join(", ") || "aucune"}`,
    );
  }
  return true;
}

// --- Programme ------------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = lireArguments(process.argv.slice(2));
  chargerEnvironnement();
  const configBase = lireConfigIa(process.env);
  const config = {
    ...configBase,
    ...(options.model ? { model: options.model } : {}),
    ...(options.effort ? { effort: options.effort } : {}),
  };

  console.log("Vérification de l'accès à l'API d'Anthropic");
  console.log(
    `modèle ${config.model} · effort ${config.effort} · ${config.maxTokens} jetons de sortie au plus · délai ${secondes(config.timeoutMs)}`,
  );

  // 1. Le schéma, sans réseau : ce que l'API refuserait par un HTTP 400.
  titre("1. Schéma de sortie (hors ligne)");
  const verification = verifierSchema(SCHEMA_REPONSE);
  const s = verification.stats;
  console.log(
    `    ${s.objets} objets · ${s.unions} paramètre(s) avec union (limite ${LIMITES_API.unions}) · ${s.optionnels} optionnel(s) (limite ${LIMITES_API.optionnels}) · ${s.enums} enum · ${s.tailleOctets} octets`,
  );
  if (verification.violations.length > 0) {
    ko("le schéma dépasse les limites documentées : l'API le refuserait (HTTP 400)");
    for (const v of verification.violations) console.log(`      - ${v}`);
    process.exit(1);
  }
  ok("le schéma respecte les limites documentées des sorties structurées");
  if (options.horsLigne) return;

  // 2. La clé.
  if (!config.apiKey) {
    sortir(
      "\n✗ ANTHROPIC_API_KEY absente. Définis-la dans l'environnement ou dans .env.local, puis relance.\n  (--hors-ligne vérifie le schéma sans clé.)",
      2,
    );
  }
  const evaluer = creerEvaluateurIa(creerClientAnthropic(config), config);

  // 3. Un appel texte, puis un appel avec capture.
  const date = new Date().toISOString().slice(0, 10);
  const texte = [
    "Moi : Bonjour, la veste est toujours disponible ?",
    "Vendeur : Oui. Je préfère un paiement PayPal, c'est plus simple pour moi.",
  ].join("\n");
  const requeteTexte = construireRequete({ images: [], texte, aujourdhui: date }, config);
  console.log(
    `\nRequête : ${JSON.stringify(requeteTexte).length} octets hors captures · schéma ${s.tailleOctets} octets · prompt système mis en cache`,
  );

  let tout = await appeler("2. Appel texte", evaluer, config.model, {
    images: [],
    texte,
    aujourdhui: date,
  });

  if (!options.sansImage) {
    const image = chargerImage(options.image);
    console.log(
      `\nCapture : ${options.image.replace(`${racine}/`, "")} (${image.mediaType}, ${Math.round((image.base64.length * 3) / 4 / 1024)} Ko)`,
    );
    const imageOk = await appeler("3. Appel avec capture", evaluer, config.model, {
      images: [image],
      aujourdhui: date,
    });
    tout = tout && imageOk;
  }

  titre("Verdict");
  if (tout) {
    ok("l'API accepte le schéma, les captures et le modèle : l'analyse réelle peut fonctionner");
    return;
  }
  ko("au moins un appel a échoué : le détail ci-dessus donne le message exact de l'API");
  process.exit(1);
}

main().catch((erreur: unknown) => {
  // Jamais le message brut d'une exception : il pourrait contenir la clé ou un chemin.
  console.error(`\n✗ Erreur inattendue (${erreur instanceof Error ? erreur.name : "inconnue"}).`);
  process.exit(1);
});
