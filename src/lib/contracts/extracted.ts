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

const texteOuNull = z.string().nullable();
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
  auteur: AuteurMessageSchema,
  texte: z.string(),
});

export const ExtractedDataSchema = z.object({
  plateforme: PlateformeSchema.nullable(),
  /** Types d'écrans reconnus dans les captures. */
  ecrans: z.array(EcranSchema),
  annonce: AnnonceSchema,
  vendeur: VendeurSchema,
  messages: z.array(MessageSchema),
  /** URLs visibles dans les captures ou les messages. */
  liens: z.array(z.string()),
});
export type ExtractedData = z.infer<typeof ExtractedDataSchema>;

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
  };
}
