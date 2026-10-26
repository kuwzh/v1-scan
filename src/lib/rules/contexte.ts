import type { ExtractedData } from "../contracts/extracted";
import { MAX_URL_CHARS } from "../contracts/limits";
import { extraireLiens } from "../links/extract";
import type { LienAnalyse } from "../links/types";
import { normaliserTexte } from "./texte";
import type { Contexte, EntreeRegles, Segment } from "./types";

function segment(
  source: Segment["source"],
  auteur: Segment["auteur"],
  brut: string | null | undefined,
): Segment | null {
  const texte = (brut ?? "").trim();
  if (texte === "") return null;
  return { source, auteur, brut: texte, norm: normaliserTexte(texte) };
}

/**
 * Liens à analyser : ceux que l'IA a lus à l'écran, plus ceux qu'on trouve dans la
 * description, les messages (hors messages de l'acheteur) et le texte collé.
 * Sans doublon, 20 au plus.
 */
export function collecterLiensBruts(donnees: ExtractedData, texte?: string | null): string[] {
  const sources = [
    donnees.annonce.description ?? "",
    ...donnees.messages.filter((m) => m.auteur !== "acheteur").map((m) => m.texte),
    texte ?? "",
  ];
  const tous = [...donnees.liens, ...sources.flatMap((s) => extraireLiens(s))];
  const vus = new Set<string>();
  const liens: string[] = [];
  for (const lien of tous) {
    const propre = lien.trim().slice(0, MAX_URL_CHARS);
    const cle = propre.toLowerCase();
    if (propre === "" || vus.has(cle)) continue;
    vus.add(cle);
    liens.push(propre);
    if (liens.length >= 20) break;
  }
  return liens;
}

export function construireContexte(entree: EntreeRegles): Contexte {
  const { donnees } = entree;

  const description = segment("description", "vendeur", donnees.annonce.description);
  const messages: Segment[] = [];
  for (const m of donnees.messages) {
    if (m.auteur === "acheteur") continue;
    const s = segment("message", m.auteur === "vendeur" ? "vendeur" : "inconnu", m.texte);
    if (s) messages.push(s);
  }
  const brut = segment("texte", "inconnu", entree.texte);
  if (brut) messages.push(brut);

  const segments = description ? [description, ...messages] : messages;
  const liensNonOfficiels: readonly LienAnalyse[] = entree.liens.filter(
    (l) => l.verdict === "suspect" || l.verdict === "inconnu",
  );
  const liensSuspects: readonly LienAnalyse[] = entree.liens.filter((l) => l.verdict === "suspect");
  const plateforme = donnees.plateforme;

  return {
    donnees,
    plateforme,
    plateformeLocale: plateforme === "leboncoin" || plateforme === "facebook_marketplace",
    segments,
    messages,
    liens: entree.liens,
    liensNonOfficiels,
    liensSuspects,
  };
}
