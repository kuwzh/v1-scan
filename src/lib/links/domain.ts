import { parse } from "tldts";

export interface HoteAnalyse {
  /** Hôte en ASCII, en minuscules, sans point final. */
  hote: string;
  /** Domaine enregistrable (PSL, y compris suffixes privés comme `pages.dev`). */
  domaine: string | null;
  /** Suffixe public (`fr`, `co.uk`, `pages.dev`…). */
  suffixe: string | null;
  /** Étiquettes à gauche du domaine enregistrable, séparées par des points. */
  sousDomaine: string;
  estIp: boolean;
  /** Le suffixe figure dans la PSL (public ou privé) : le TLD existe vraiment. */
  suffixeConnu: boolean;
  /** Le suffixe est un hébergement ouvert à tous (`pages.dev`, `github.io`, `blogspot.com`…). */
  suffixePrive: boolean;
  /** Partie du domaine à gauche du suffixe (`vinted-paiement` pour `vinted-paiement.com`). */
  etiquette: string;
}

/**
 * Découpe un hôte avec la Public Suffix List. Les suffixes privés sont pris en compte :
 * pour `vinted-paiement.pages.dev`, le domaine enregistrable est l'hôte entier, pas
 * `pages.dev`, ce qui est le bon niveau pour juger de l'imitation d'une marque.
 */
export function analyserHote(hoteBrut: string): HoteAnalyse {
  const hote = hoteBrut.toLowerCase().replace(/\.+$/, "");
  const r = parse(hote, { allowPrivateDomains: true });
  const domaine = r.domain ?? null;
  const suffixe = r.publicSuffix ?? null;
  const etiquette =
    domaine && suffixe && domaine.length > suffixe.length
      ? domaine.slice(0, domaine.length - suffixe.length - 1)
      : "";
  return {
    hote,
    domaine,
    suffixe,
    sousDomaine: r.subdomain ?? "",
    estIp: r.isIp === true,
    suffixeConnu: r.isIcann === true || r.isPrivate === true,
    suffixePrive: r.isPrivate === true,
    etiquette,
  };
}

/** Vrai si `hote` est ce domaine ou l'un de ses sous-domaines. */
export function estSousDomaineDe(hote: string, domaine: string): boolean {
  return hote === domaine || hote.endsWith(`.${domaine}`);
}
