import { describe, expect, it } from "vitest";
import { MOTIFS } from "./motifs";
import { normaliserTexte } from "./texte";

/** Chaque motif doit reconnaître ses cas et laisser passer ceux qui y ressemblent sans en être. */
function motif(nom: string, re: RegExp, positifs: string[], negatifs: string[]) {
  describe(nom, () => {
    it.each(positifs)("reconnaît « %s »", (texte) => {
      expect(re.test(normaliserTexte(texte))).toBe(true);
    });
    it.each(negatifs)("ignore « %s »", (texte) => {
      expect(re.test(normaliserTexte(texte))).toBe(false);
    });
  });
}

motif(
  "whatsapp",
  MOTIFS.whatsapp,
  ["WhatsApp", "écris-moi sur whats app", "watsap", "whatsap", "wtsp", "Whatapp"],
  ["what's up", "applications", "les apps"],
);
motif("telegram", MOTIFS.telegram, ["Telegram", "t.me/abc", "sur telegramme"], ["tel gram"]);
motif(
  "telephoneFr",
  MOTIFS.telephoneFr,
  [
    "06 12 34 56 78",
    "0612345678",
    "06.12.34.56.78",
    "06-12-34-56-78",
    "+33 6 12 34 56 78",
    "+33612345678",
    "0033 6 12 34 56 78",
    "01 23 45 67 89",
  ],
  ["2024-05-12", "01/02/2024", "taille 38 40 42", "ref 123456", "prix 1 234 567 89", "0,5 mm"],
);
motif(
  "telephoneIntl",
  MOTIFS.telephoneIntl,
  ["+44 7911 123456", "+32 470 12 34 56"],
  ["+33 6 12 34 56 78", "5+5"],
);
motif(
  "email",
  MOTIFS.email,
  ["jean.dupont@gmail.com", "contact_vente@hotmail.fr"],
  ["@pseudo", "a@b", "rdv à 14h"],
);
motif(
  "virement",
  MOTIFS.virement,
  [
    "virement",
    "des virements",
    "mon IBAN",
    "mon RIB",
    "FR76 3000 6000 0112 3456 7890 189",
    "je peux virer",
  ],
  ["un revirement de situation", "des ribs", "tribord", "ribambelle"],
);
motif(
  "horsPlateforme",
  MOTIFS.horsPlateforme,
  [
    "en dehors de Vinted",
    "hors vinted",
    "sans passer par Vinted",
    "pas besoin de passer par la plateforme",
    "pour éviter les frais",
  ],
  ["hors série", "je passe par l'appli", "sans frais de port"],
);
motif(
  "mandatCarteCadeau",
  MOTIFS.mandatCarteCadeau,
  [
    "mandat cash",
    "Western Union",
    "carte Neosurf",
    "Neosurf",
    "carte cadeau",
    "recharge PCS",
    "paysafecard",
  ],
  ["un mandat", "carte graphique", "lot de 10 pcs", "carte mère"],
);
motif(
  "crypto",
  MOTIFS.crypto,
  ["paiement en bitcoin", "paiement uniquement en crypto", "bitcoin uniquement"],
  ["Ledger crypto wallet", "vend un bitcoin miner", "formation crypto"],
);
motif(
  "acompte",
  MOTIFS.acompte,
  ["un acompte de 50 €", "des arrhes", "pour réserver il faut 20 euros"],
  ["je réserve pour toi", "compte"],
);
motif(
  "carteBancaire",
  MOTIFS.carteBancaire,
  [
    "numéro de ta carte",
    "le cryptogramme",
    "CVV",
    "date d'expiration",
    "les infos de ta carte",
    "photo de ta carte bancaire",
    "code au dos",
  ],
  [
    "numéro de carte d'identité",
    "photo de ta carte d'identité",
    "infos de ta carte vitale",
    "numéro de ta carte grise",
    "carte graphique",
    "photo de ta carte",
  ],
);
motif(
  "codeSensible",
  MOTIFS.codeSensible,
  [
    "le code reçu par SMS",
    "code de vérification",
    "code de confirmation",
    "le code que tu vas recevoir",
    "code envoyé par mail",
    "code à 6 chiffres",
    "OTP",
  ],
  [
    "code postal 75011, mon téléphone",
    "code promo ÉTÉ",
    "code barre",
    "code couleur 38",
    "code de suivi 12345",
  ],
);
motif(
  "verbeDemande",
  MOTIFS.verbeDemande,
  [
    "envoie",
    "envoyez",
    "donne",
    "communique",
    "transmets",
    "indique",
    "dicte",
    "partage",
    "montre",
  ],
  ["bonjour", "voici"],
);
motif(
  "paiementEffectue",
  MOTIFS.paiementEffectue,
  [
    "j'ai déjà payé",
    "j'ai payé",
    "j'ai effectué le paiement",
    "j'ai viré",
    "paiement effectué",
    "ton argent est bloqué",
    "fonds en attente",
  ],
  ["j'ai envoyé le colis", "j'ai fait un paquet", "je paye demain"],
);
motif(
  "actionRecevoir",
  MOTIFS.actionRecevoir,
  [
    "clique ici pour recevoir l'argent",
    "valide pour débloquer ton paiement",
    "connecte-toi pour récupérer les fonds",
  ],
  ["clique sur le lien pour voir les photos", "j'ai bien envoyé le colis, valide la réception"],
);
motif(
  "transporteur",
  MOTIFS.transporteur,
  ["Mondial Relay", "Colissimo", "DPD", "le livreur", "la poste"],
  ["le colis", "poste de travail"],
);
motif(
  "fraisOuBlocage",
  MOTIFS.fraisOuBlocage,
  ["frais de livraison", "colis bloqué", "supplément à régler"],
  ["tu peux payer", "le paiement se fait par Vinted"],
);
motif(
  "tropPercu",
  MOTIFS.tropPercu,
  [
    "je t'ai envoyé 50 € de trop, peux-tu me rembourser",
    "virement fait par erreur, merci de me renvoyer la somme",
    "un trop-perçu à rembourser",
  ],
  ["j'ai envoyé le colis par erreur à ton ancienne adresse, je te rembourse les frais de port"],
);
motif(
  "rembourseApres",
  MOTIFS.rembourseApres,
  ["je te rembourse ensuite", "avance les frais d'envoi, je te rembourse"],
  ["je te rembourse les frais de port"],
);
motif(
  "fraisSupplementaires",
  MOTIFS.fraisSupplementaires,
  [
    "frais de douane",
    "frais de dédouanement",
    "frais d'assurance",
    "taxe de douane",
    "pour le dédouanement",
    "mon transitaire",
  ],
  ["frais de port inclus", "livraison gratuite", "douane"],
);
motif(
  "paiementPlateforme",
  MOTIFS.paiementPlateforme,
  [
    "paiement via Vinted",
    "le paiement se fait par Vinted",
    "paiement uniquement via la plateforme",
    "colis via Vinted",
    "Vinted Go",
  ],
  ["paiement par virement", "je vends sur Vinted"],
);
motif(
  "pieceIdentite",
  MOTIFS.pieceIdentite,
  ["carte d'identité", "passeport", "CNI", "permis de conduire"],
  ["carte vitale", "carte grise"],
);

describe("pression : une entrée par famille de formules", () => {
  const exemples: Array<[famille: number, positif: string, negatif: string]> = [
    [0, "réponds vite", "invite"],
    [1, "dernier prix, c'est urgent", "ça ne presse pas"],
    [2, "paie tout de suite", "plus tard"],
    [3, "plusieurs personnes sont intéressées", "une personne"],
    [4, "ne tarde pas", "prends ton temps"],
  ];
  it("couvre cinq familles", () => {
    expect(MOTIFS.pression).toHaveLength(exemples.length);
  });
  it.each(exemples)("famille %i : « %s »", (famille, positif, negatif) => {
    const re = MOTIFS.pression[famille]!;
    expect(re.test(normaliserTexte(positif))).toBe(true);
    expect(re.test(normaliserTexte(negatif))).toBe(false);
  });
});
