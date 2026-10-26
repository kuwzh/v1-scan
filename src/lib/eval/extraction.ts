import type { Confiance, ExtractedData } from "../contracts/extracted";
import { normaliserTexte } from "../rules/texte";
import { stat } from "./metriques";
import type {
  AttenduExtraction,
  Auteur,
  AuteurCompare,
  ChampCompare,
  IssueChamp,
  SortieCas,
  StatTaux,
} from "./types";

function comparable(texte: string): string {
  return normaliserTexte(texte)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type Attendu = string | number | boolean | { valeur: number; tolerance: number } | null;

function egal(attendu: Exclude<Attendu, null>, obtenu: unknown): boolean {
  if (typeof attendu === "object") {
    return typeof obtenu === "number" && Math.abs(obtenu - attendu.valeur) <= attendu.tolerance;
  }
  if (typeof attendu === "number") {
    return typeof obtenu === "number" && Math.abs(obtenu - attendu) < 0.011;
  }
  if (typeof attendu === "boolean") return obtenu === attendu;
  if (typeof obtenu !== "string") return false;
  const a = comparable(attendu);
  const o = comparable(obtenu);
  return o.includes(a) || a.includes(o);
}

function comparerChamp(
  champ: string,
  attendu: Attendu,
  obtenu: unknown,
  confiance: Confiance | null,
): ChampCompare {
  let issue: IssueChamp;
  if (attendu === null) issue = obtenu === null ? "correct_null" : "invention";
  else if (obtenu === null) issue = "manquant";
  else issue = egal(attendu, obtenu) ? "correct" : "faux";
  return { champ, attendu, obtenu, confiance, issue };
}

/** Compare, champ par champ, ce que l'IA a lu avec ce qui était attendu. */
export function comparerExtraction(
  attendu: AttenduExtraction,
  donnees: ExtractedData,
): ChampCompare[] {
  const lignes: ChampCompare[] = [];
  if (attendu.plateforme !== undefined) {
    lignes.push(comparerChamp("plateforme", attendu.plateforme, donnees.plateforme, null));
  }
  for (const groupe of ["annonce", "vendeur"] as const) {
    const attendus = (attendu[groupe] ?? {}) as Record<string, Attendu | undefined>;
    const valeurs = donnees[groupe] as Record<string, unknown>;
    const confiances = donnees.confiance[groupe] as Record<string, Confiance | null>;
    for (const [cle, valeur] of Object.entries(attendus)) {
      if (valeur === undefined) continue;
      lignes.push(
        comparerChamp(`${groupe}.${cle}`, valeur, valeurs[cle] ?? null, confiances[cle] ?? null),
      );
    }
  }
  return lignes;
}

/** Compare l'auteur attribué à chaque message avec l'auteur attendu. */
export function comparerAuteurs(
  attendus: ReadonlyArray<{ contient: string; auteur: Auteur }>,
  donnees: ExtractedData,
): AuteurCompare[] {
  return attendus.map(({ contient, auteur }) => {
    const cible = comparable(contient);
    const trouve = donnees.messages.find((m) => comparable(m.texte).includes(cible));
    if (!trouve) return { contient, attendu: auteur, obtenu: null, issue: "manquant" as const };
    return {
      contient,
      attendu: auteur,
      obtenu: trouve.auteur,
      issue: trouve.auteur === auteur ? ("correct" as const) : ("faux" as const),
    };
  });
}

/** Messages interdits qui figurent quand même dans l'extraction : des inventions. */
export function messagesInventes(interdits: readonly string[], donnees: ExtractedData): string[] {
  return interdits.filter((extrait) => {
    const cible = comparable(extrait);
    return donnees.messages.some((m) => comparable(m.texte).includes(cible));
  });
}

export interface RapportExtraction {
  cas: number;
  /** Champs attendus non nuls : lus correctement ? */
  exactitude: StatTaux;
  /** Champs attendus nuls : l'IA a-t-elle inventé une valeur ? C'est le taux d'invention. */
  invention: StatTaux;
  /** Champs lus faux malgré une confiance « haute » : les erreurs les plus dangereuses. */
  fauxConfiantes: { k: number; sur: number };
  /** Exactitude selon la confiance annoncée : la confiance est-elle fiable ? */
  calibration: Record<Confiance, StatTaux>;
  /** Parmi les inventions, combien portaient une confiance « basse » (donc ignorées par les règles). */
  inventionsIgnoreesParLesRegles: { k: number; sur: number };
  parChamp: Record<
    string,
    { correct: number; faux: number; manquant: number; invention: number; correctNull: number }
  >;
  auteurs: {
    total: StatTaux;
    /** Un message de l'acheteur attribué au vendeur : le cas qui crée des faux positifs. */
    acheteurPrisPourVendeur: number;
    vendeurPrisPourAcheteur: number;
    /** Attribué à quelqu'un alors que rien ne permettait de le dire. */
    devine: number;
    attribuesAInconnu: StatTaux;
  };
  messagesInventes: number;
  lignes: Array<ChampCompare & { cas: string }>;
}

/** Agrège l'exactitude de l'extraction sur les cas qui en précisent les attentes. */
export function calculerExtraction(sorties: readonly SortieCas[]): RapportExtraction {
  const lignes: RapportExtraction["lignes"] = [];
  const auteurs: Array<AuteurCompare & { cas: string }> = [];
  let inventes = 0;
  let cas = 0;

  for (const s of sorties) {
    const attendu = s.cas.attendu.extraction;
    if (!attendu || s.statut !== "analyse" || !s.resultat) continue;
    // Sans IA (règles seules, ou IA en échec), il n'y a eu aucune extraction à juger.
    if (s.ia && s.ia.statut !== "ok") continue;
    cas++;
    const donnees = s.resultat.donnees_extraites;
    for (const l of comparerExtraction(attendu, donnees)) lignes.push({ ...l, cas: s.cas.id });
    for (const a of comparerAuteurs(attendu.messages ?? [], donnees))
      auteurs.push({ ...a, cas: s.cas.id });
    inventes += messagesInventes(attendu.messagesInterdits ?? [], donnees).length;
  }

  const attendusNonNuls = lignes.filter(
    (l) => l.issue === "correct" || l.issue === "faux" || l.issue === "manquant",
  );
  const attendusNuls = lignes.filter((l) => l.issue === "correct_null" || l.issue === "invention");
  const inventions = lignes.filter((l) => l.issue === "invention");
  const fauxConfiants = lignes.filter((l) => l.issue === "faux" && l.confiance === "haute");
  const lusAvecConfiance = lignes.filter(
    (l) => (l.issue === "correct" || l.issue === "faux") && l.confiance !== null,
  );

  const calibration = { haute: stat(0, 0), moyenne: stat(0, 0), basse: stat(0, 0) } as Record<
    Confiance,
    StatTaux
  >;
  for (const niveau of ["haute", "moyenne", "basse"] as const) {
    const groupe = lusAvecConfiance.filter((l) => l.confiance === niveau);
    calibration[niveau] = stat(groupe.filter((l) => l.issue === "correct").length, groupe.length);
  }

  const parChamp: RapportExtraction["parChamp"] = {};
  for (const l of lignes) {
    const c = (parChamp[l.champ] ??= {
      correct: 0,
      faux: 0,
      manquant: 0,
      invention: 0,
      correctNull: 0,
    });
    if (l.issue === "correct_null") c.correctNull++;
    else c[l.issue]++;
  }

  const reponduParIa = auteurs.filter((a) => a.issue !== "manquant");
  const inconnusAttendus = reponduParIa.filter((a) => a.attendu === "inconnu");
  return {
    cas,
    exactitude: stat(
      attendusNonNuls.filter((l) => l.issue === "correct").length,
      attendusNonNuls.length,
    ),
    invention: stat(inventions.length, attendusNuls.length),
    fauxConfiantes: {
      k: fauxConfiants.length,
      sur: attendusNonNuls.filter((l) => l.issue !== "manquant").length,
    },
    calibration,
    inventionsIgnoreesParLesRegles: {
      k: inventions.filter((l) => l.confiance === "basse").length,
      sur: inventions.length,
    },
    parChamp,
    auteurs: {
      total: stat(reponduParIa.filter((a) => a.issue === "correct").length, reponduParIa.length),
      acheteurPrisPourVendeur: reponduParIa.filter(
        (a) => a.attendu === "acheteur" && a.obtenu === "vendeur",
      ).length,
      vendeurPrisPourAcheteur: reponduParIa.filter(
        (a) => a.attendu === "vendeur" && a.obtenu === "acheteur",
      ).length,
      devine: reponduParIa.filter((a) => a.attendu === "inconnu" && a.obtenu !== "inconnu").length,
      attribuesAInconnu: stat(
        inconnusAttendus.filter((a) => a.obtenu === "inconnu").length,
        inconnusAttendus.length,
      ),
    },
    messagesInventes: inventes,
    lignes,
  };
}
