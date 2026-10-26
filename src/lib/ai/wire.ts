import { z } from "zod";
import {
  EcranSchema,
  PlateformeSchema,
  AuteurMessageSchema,
  ConfianceSchema,
} from "../contracts/extracted";
import { GraviteIaSchema } from "../contracts/signals";
import { NiveauSchema } from "../contracts/niveau";

/**
 * Schéma de la réponse JSON demandée au modèle (sorties structurées).
 *
 * Volontairement sans contraintes de valeur (bornes, longueurs) : l'API ne les gère pas et le
 * SDK les retirerait de toute façon. Les limites sont appliquées ensuite, de façon tolérante,
 * par `normaliserReponse` : on borne une valeur aberrante au lieu de rejeter toute la réponse.
 * Les descriptions répètent les consignes essentielles au plus près de chaque champ.
 */
const confiance = ConfianceSchema.nullable().describe(
  "Confiance dans la valeur : haute, moyenne ou basse. null si la valeur est null.",
);

const NULL_SI_ABSENT = "null si ce n'est pas écrit ou affiché dans le contenu reçu.";

export const ReponseModeleSchema = z.object({
  contenu_exploitable: z
    .boolean()
    .describe(
      "false si le contenu n'est ni une annonce, ni un profil, ni une conversation, ou s'il est illisible.",
    ),
  donnees_extraites: z.object({
    plateforme: PlateformeSchema.nullable().describe(
      "vinted, leboncoin, facebook_marketplace ou autre, d'après l'interface ou l'adresse visibles ; null si rien ne l'indique.",
    ),
    ecrans: z
      .array(EcranSchema)
      .describe("Types d'écrans reconnus : annonce, profil_vendeur, conversation, autre."),
    annonce: z.object({
      titre: z.string().nullable().describe(`Titre de l'annonce ; ${NULL_SI_ABSENT}`),
      prix_eur: z
        .number()
        .nullable()
        .describe(`Prix demandé en euros (nombre décimal) ; ${NULL_SI_ABSENT}`),
      marque: z.string().nullable().describe(`Marque indiquée ; ${NULL_SI_ABSENT}`),
      categorie: z
        .string()
        .nullable()
        .describe(`Type d'article en quelques mots ; ${NULL_SI_ABSENT}`),
      description: z.string().nullable().describe(`Description de l'annonce ; ${NULL_SI_ABSENT}`),
      nombre_photos: z
        .number()
        .nullable()
        .describe(`Nombre de photos de l'annonce (compteur 1/5, miniatures) ; ${NULL_SI_ABSENT}`),
    }),
    vendeur: z.object({
      anciennete_jours: z
        .number()
        .nullable()
        .describe(
          `Ancienneté du compte en jours, calculée depuis la date du jour ; null si aucune date d'inscription n'est affichée.`,
        ),
      nombre_avis: z
        .number()
        .nullable()
        .describe(
          "Nombre d'avis affiché ; 0 seulement si l'écran dit clairement qu'il n'y en a aucun ; null si la zone n'est pas visible.",
        ),
      note_sur_5: z.number().nullable().describe(`Note moyenne ramenée sur 5 ; ${NULL_SI_ABSENT}`),
      localisation: z.string().nullable().describe(`Ville ou région affichée ; ${NULL_SI_ABSENT}`),
      nombre_annonces: z
        .number()
        .nullable()
        .describe(`Nombre d'annonces du vendeur affiché ; ${NULL_SI_ABSENT}`),
      profil_verifie: z
        .boolean()
        .nullable()
        .describe(
          "true si la plateforme affiche une vérification du profil, false si elle montre explicitement qu'il n'y en a pas, null sinon.",
        ),
    }),
    messages: z
      .array(
        z.object({
          auteur: AuteurMessageSchema.describe(
            "acheteur = l'utilisateur ; vendeur = son interlocuteur ; inconnu = impossible à dire. Ne jamais deviner.",
          ),
          confiance: ConfianceSchema.describe("Confiance dans la transcription de ce message."),
          texte: z
            .string()
            .describe(
              "Message recopié fidèlement, prénoms et pseudos remplacés par [nom], sans résumé.",
            ),
        }),
      )
      .describe("Messages de la conversation, dans l'ordre."),
    liens: z
      .array(z.string())
      .describe(
        "Adresses visibles dans l'annonce ou dans les messages du vendeur ou d'auteur inconnu (pas ceux de l'acheteur), recopiées sans correction.",
      ),
    confiance: z.object({
      annonce: z.object({
        titre: confiance,
        prix_eur: confiance,
        marque: confiance,
        categorie: confiance,
        description: confiance,
        nombre_photos: confiance,
      }),
      vendeur: z.object({
        anciennete_jours: confiance,
        nombre_avis: confiance,
        note_sur_5: confiance,
        localisation: confiance,
        nombre_annonces: confiance,
        profil_verifie: confiance,
      }),
    }),
  }),
  score: z.number().describe("Score de risque de 0 à 100."),
  niveau: NiveauSchema.describe("faible (0–29), moyen (30–59) ou élevé (60–100)."),
  signaux: z
    .array(
      z.object({
        label: z
          .string()
          .describe("Une phrase courte et factuelle, sans accusation, au tutoiement si besoin."),
        gravite: GraviteIaSchema.describe("info, attention ou importante. Jamais critique."),
      }),
    )
    .describe("De 0 à 6 signaux d'alerte, chacun appuyé sur un fait observable."),
  rassurants: z
    .array(z.object({ label: z.string().describe("Un fait observable qui rassure.") }))
    .describe("De 0 à 4 éléments rassurants, seulement s'ils sont visibles."),
  conseils: z.array(z.string()).describe("De 2 à 4 conseils concrets, au tutoiement."),
});
export type ReponseModele = z.infer<typeof ReponseModeleSchema>;

/**
 * Schéma JSON envoyé à l'API dans `output_config.format`.
 *
 * On ne passe PAS par `zodOutputFormat` du SDK : sa transformation (v1.3.0) ne conserve que le
 * type, la description et la structure, et recopie tous les `enum` dans le texte de la
 * description au lieu de les imposer. Les valeurs fermées (gravité, auteur, confiance, niveau)
 * ne seraient plus garanties par l'API. `z.toJSONSchema` les garde, et ce schéma est écrit
 * pour n'employer que des mots-clés supportés (un test le vérifie).
 */
/**
 * `type: ["number", "null"]` → `anyOf: [{ type: "number" }, { type: "null" }]` : la seconde forme
 * est celle que la documentation des sorties structurées cite (anyOf, type null).
 */
function sansTypesTableaux(noeud: unknown): unknown {
  if (Array.isArray(noeud)) return noeud.map(sansTypesTableaux);
  if (noeud === null || typeof noeud !== "object") return noeud;
  const copie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(noeud)) copie[cle] = sansTypesTableaux(valeur);
  if (Array.isArray(copie.type)) {
    const { type, ...reste } = copie;
    return { ...reste, anyOf: (type as string[]).map((t) => ({ type: t })) };
  }
  return copie;
}

export const SCHEMA_REPONSE: Record<string, unknown> = (() => {
  // `reused: "inline"` : aucun $ref. Un $ref accompagné d'une description est ambigu pour les
  // sorties structurées, et le schéma reste petit même avec les sous-schémas répétés.
  const schema = z.toJSONSchema(ReponseModeleSchema, { reused: "inline" }) as Record<
    string,
    unknown
  >;
  delete schema.$schema; // la version du dialecte n'est pas utile à l'API
  return sansTypesTableaux(schema) as Record<string, unknown>;
})();
