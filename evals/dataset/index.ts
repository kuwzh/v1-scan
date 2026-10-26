import type { CasEval } from "../../src/lib/eval/types";
import { CAS_IMAGES, DATE_EVAL } from "./images";
import { TEXTES_SAINS } from "./textes-sains";
import { TEXTES_SUSPECTS } from "./textes-suspects";

export { CAS_IMAGES, DATE_EVAL, TEXTES_SAINS, TEXTES_SUSPECTS };

export const CAS_TEXTE: readonly CasEval[] = [...TEXTES_SAINS, ...TEXTES_SUSPECTS];
export const TOUS_LES_CAS: readonly CasEval[] = [...CAS_TEXTE, ...CAS_IMAGES];
