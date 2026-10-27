import type { SuiviIa } from "../analyze/pipeline";
import type { CodeDiagnostic, Diagnostic } from "../contracts/diagnostic";
import { fr } from "../copy/fr";

/**
 * Message de diagnostic. En production : une phrase générale, qui n'apprend rien sur la
 * configuration. En preview et en développement (`detaille`) : le détail technique.
 * `null` quand le message principal dit déjà tout (forte affluence en production).
 */
export function creerDiagnostic(
  code: CodeDiagnostic,
  options: { detaille: boolean; technique?: string },
): Diagnostic | null {
  const texte = fr.diagnostic[code];
  const message = options.detaille ? texte.detail(options.technique) : texte.public;
  return message === null ? null : { code, message };
}

/** Code de diagnostic d'un échec de l'appel à l'IA, ou `null` si l'IA n'a pas échoué. */
export function diagnosticDepuisSuivi(
  ia: SuiviIa | undefined,
): { code: CodeDiagnostic; technique?: string } | null {
  if (!ia || ia.statut !== "echec") return null;
  return {
    code: `ia_echec_${ia.raison}` as CodeDiagnostic,
    ...(ia.detail ? { technique: ia.detail } : {}),
  };
}
