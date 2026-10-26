import { z } from "zod";

/**
 * Données structurées lues dans les captures ou le texte collé.
 *
 * Tous les champs sont requis mais `nullable` : l'IA renvoie `null` quand une
 * information est absente de l'écran, plutôt que de l'inventer. On n'extrait pas les
 * pseudos ni les noms (minimisation des données : le score n'en a pas besoin).
 */
export const PLATEFORMES = ["vinted", "leboncoin", "facebook_marketplace", "autre"] as const;
export const PlateformeSchema = z.enum(PLATEFORMES);
export type Plateforme = z.infer<typeof PlateformeSchema>;

export const ECRANS = ["annonce", "profil_vendeur", "conversation", "autre"] as const;
export const EcranSchema = z.enum(ECRANS);
export type Ecran = z.infer<typeof EcranSchema>;

export const AuteurMessageSchema = z.enum(["vendeur", "acheteur", "inconnu"]);

/**
 * Confiance de l'IA dans une donnée lue : « haute » (lisible sans ambiguïté), « moyenne »
 * (partielle, ou calculée comme une ancienneté déduite de « membre depuis mars 2023 »),
 * « basse » (flou, coupé, ambigu). Les règles ignorent les données à confiance basse.
 */
export const CONFIANCES = ["haute", "moyenne", "basse"] as const;
export const ConfianceSchema = z.enum(CONFIANCES);
export type Confiance = z.infer<typeof ConfianceSchema>;

const texteOuNull = z.string().nullable();
const confianceOuNull = ConfianceSchema.nullable();
const entierOuNull = z.number().int().nonnegative().nullable();

export const AnnonceSchema = z.object({
  titre: texteOuNull,
  prix_eur: z.number().nonnegative().nullable(),
  marque: texteOuNull,
  /** Type d'article en quelques mots (« sac à main », « smartphone »…). */
  categorie: texteOuNull,
  description: texteOuNull,
  nombre_photos: entierOuNull,
});

export const VendeurSchema = z.object({
  /** Ancienneté du compte en jours, estimée à partir de « membre depuis… ». */
  anciennete_jours: entierOuNull,
  nombre_avis: entierOuNull,
  note_sur_5: z.number().min(0).max(5).nullable(),
  localisation: texteOuNull,
  nombre_annonces: entierOuNull,
  /** Badges de vérification affichés par la plateforme (e-mail, téléphone…). */
  profil_verifie: z.boolean().nullable(),
});

export const MessageSchema = z.object({
  /**
   * `acheteur` : l'utilisateur lui-même. `vendeur` : son interlocuteur. `inconnu` : l'IA ne peut
   * pas le déterminer (texte collé sans étiquette, bulles non attribuables). Les règles ne
   * lisent que les messages `vendeur` et `inconnu`.
   */
  auteur: AuteurMessageSchema,
  /** Confiance dans la transcription de ce message. */
  confiance: ConfianceSchema,
  texte: z.string(),
});

/** Une confiance par donnée de `annonce` et de `vendeur` ; `null` quand la donnée est `null`. */
export const ConfianceAnnonceSchema = z.object({
  titre: confianceOuNull,
  prix_eur: confianceOuNull,
  marque: confianceOuNull,
  categorie: confianceOuNull,
  description: confianceOuNull,
  nombre_photos: confianceOuNull,
});

export const ConfianceVendeurSchema = z.object({
  anciennete_jours: confianceOuNull,
  nombre_avis: confianceOuNull,
  note_sur_5: confianceOuNull,
  localisation: confianceOuNull,
  nombre_annonces: confianceOuNull,
  profil_verifie: confianceOuNull,
});

export const ExtractedDataSchema = z.object({
  plateforme: PlateformeSchema.nullable(),
  /** Types d'écrans reconnus dans les captures. */
  ecrans: z.array(EcranSchema),
  annonce: AnnonceSchema,
  vendeur: VendeurSchema,
  messages: z.array(MessageSchema),
  /** URLs visibles dans l'annonce ou dans les messages du vendeur (ou d'auteur inconnu). */
  liens: z.array(z.string()),
  confiance: z.object({
    annonce: ConfianceAnnonceSchema,
    vendeur: ConfianceVendeurSchema,
  }),
});
export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
export type Message = z.infer<typeof MessageSchema>;

/** Données vides : point de départ quand l'IA n'a rien pu lire (ou n'a pas été appelée). */
export function donneesExtraitesVides(): ExtractedData {
  return {
    plateforme: null,
    ecrans: [],
    annonce: {
      titre: null,
      prix_eur: null,
      marque: null,
      categorie: null,
      description: null,
      nombre_photos: null,
    },
    vendeur: {
      anciennete_jours: null,
      nombre_avis: null,
      note_sur_5: null,
      localisation: null,
      nombre_annonces: null,
      profil_verifie: null,
    },
    messages: [],
    liens: [],
    confiance: {
      annonce: {
        titre: null,
        prix_eur: null,
        marque: null,
        categorie: null,
        description: null,
        nombre_photos: null,
      },
      vendeur: {
        anciennete_jours: null,
        nombre_avis: null,
        note_sur_5: null,
        localisation: null,
        nombre_annonces: null,
        profil_verifie: null,
      },
    },
  };
}

/** Construit un message ; la confiance est « haute » sauf indication contraire. */
export function creerMessage(
  auteur: Message["auteur"],
  texte: string,
  confiance: Confiance = "haute",
): Message {
  return { auteur, texte, confiance };
}

/**
 * Renseigne la confiance des données présentes qui n'en ont pas, et efface celle des données
 * absentes. `defaut` dit quelle confiance donner : « haute » pour des données sûres (jeux de
 * test), « basse » à la frontière de l'IA, où une donnée sans confiance ne doit pas être crue.
 */
export function completerConfiance(donnees: ExtractedData, defaut: Confiance): ExtractedData {
  const copie = structuredClone(donnees);
  for (const groupe of ["annonce", "vendeur"] as const) {
    const valeurs: Record<string, unknown> = copie[groupe];
    const confiances: Record<string, Confiance | null> = copie.confiance[groupe];
    for (const cle of Object.keys(valeurs)) {
      confiances[cle] = valeurs[cle] === null ? null : (confiances[cle] ?? defaut);
    }
  }
  return copie;
}
