import { z } from "zod";
import {
  CONFIANCES,
  EcranSchema,
  PLATEFORMES,
  PlateformeSchema,
  AuteurMessageSchema,
  ConfianceSchema,
} from "../contracts/extracted";
import { GraviteIaSchema } from "../contracts/signals";
import { NiveauSchema } from "../contracts/niveau";

/**
 * Forme INTERNE de la réponse du modèle : les données absentes y sont `null`. C'est ce que lit
 * `normaliserReponse`. Ce n'est pas ce qu'on demande à l'API : voir `ReponseApiSchema`.
 */
const confianceNulle = ConfianceSchema.nullable();

export const ReponseModeleSchema = z.object({
  contenu_exploitable: z.boolean(),
  donnees_extraites: z.object({
    plateforme: PlateformeSchema.nullable(),
    ecrans: z.array(EcranSchema),
    annonce: z.object({
      titre: z.string().nullable(),
      prix_eur: z.number().nullable(),
      marque: z.string().nullable(),
      categorie: z.string().nullable(),
      description: z.string().nullable(),
      nombre_photos: z.number().nullable(),
    }),
    vendeur: z.object({
      anciennete_jours: z.number().nullable(),
      nombre_avis: z.number().nullable(),
      note_sur_5: z.number().nullable(),
      localisation: z.string().nullable(),
      nombre_annonces: z.number().nullable(),
      profil_verifie: z.boolean().nullable(),
    }),
    messages: z.array(
      z.object({ auteur: AuteurMessageSchema, confiance: ConfianceSchema, texte: z.string() }),
    ),
    liens: z.array(z.string()),
    confiance: z.object({
      annonce: z.object({
        titre: confianceNulle,
        prix_eur: confianceNulle,
        marque: confianceNulle,
        categorie: confianceNulle,
        description: confianceNulle,
        nombre_photos: confianceNulle,
      }),
      vendeur: z.object({
        anciennete_jours: confianceNulle,
        nombre_avis: confianceNulle,
        note_sur_5: confianceNulle,
        localisation: confianceNulle,
        nombre_annonces: confianceNulle,
        profil_verifie: confianceNulle,
      }),
    }),
  }),
  score: z.number(),
  niveau: NiveauSchema,
  signaux: z.array(z.object({ label: z.string(), gravite: GraviteIaSchema })),
  rassurants: z.array(z.object({ label: z.string() })),
  conseils: z.array(z.string()),
});
export type ReponseModele = z.infer<typeof ReponseModeleSchema>;

/**
 * Forme DEMANDÉE à l'API (sorties structurées). Elle ne contient aucune union : l'API n'accepte
 * que 16 paramètres « nullables » (`anyOf` ou type en tableau) et refuse le schéma au-delà
 * (HTTP 400). Une donnée absente n'est donc pas `null` mais signalée par la confiance « aucune »,
 * avec une valeur neutre (chaîne vide, 0, false) qu'on ignore ; la plateforme inconnue est
 * « inconnue ». `depuisReponseApi` remet des `null`.
 *
 * Volontairement sans bornes ni longueurs (l'API ne les gère pas) : les limites sont appliquées
 * ensuite par `normaliserReponse` (tolérant : on borne une valeur aberrante au lieu de rejeter
 * toute la réponse), puis `AiEvaluationSchema` valide strictement le résultat avec zod.
 */
export const CONFIANCES_API = [...CONFIANCES, "aucune"] as const;
export const PLATEFORMES_API = [...PLATEFORMES, "inconnue"] as const;

const confiance = z
  .enum(CONFIANCES_API)
  .describe(
    "haute, moyenne ou basse ; « aucune » si la donnée n'est ni écrite ni affichée (la valeur est alors ignorée).",
  );

const ABSENT_TEXTE = "Chaîne vide si absent (avec la confiance « aucune »).";
const ABSENT_NOMBRE = "0 si absent (avec la confiance « aucune »).";

export const ReponseApiSchema = z.object({
  contenu_exploitable: z
    .boolean()
    .describe(
      "false si le contenu n'est ni une annonce, ni un profil, ni une conversation, ou s'il est illisible.",
    ),
  donnees_extraites: z.object({
    plateforme: z
      .enum(PLATEFORMES_API)
      .describe(
        "vinted, leboncoin, facebook_marketplace ou autre, d'après l'interface ou l'adresse visibles ; « inconnue » si rien ne l'indique.",
      ),
    ecrans: z
      .array(EcranSchema)
      .describe("Types d'écrans reconnus : annonce, profil_vendeur, conversation, autre."),
    annonce: z.object({
      titre: z.string().describe(`Titre de l'annonce. ${ABSENT_TEXTE}`),
      prix_eur: z.number().describe(`Prix demandé en euros (nombre décimal). ${ABSENT_NOMBRE}`),
      marque: z.string().describe(`Marque indiquée. ${ABSENT_TEXTE}`),
      categorie: z.string().describe(`Type d'article en quelques mots. ${ABSENT_TEXTE}`),
      description: z.string().describe(`Description de l'annonce. ${ABSENT_TEXTE}`),
      nombre_photos: z
        .number()
        .describe(`Nombre de photos de l'annonce (compteur 1/5, miniatures). ${ABSENT_NOMBRE}`),
    }),
    vendeur: z.object({
      anciennete_jours: z
        .number()
        .describe(
          "Ancienneté du compte en jours, calculée depuis la date du jour. 0 avec la confiance « aucune » si aucune date d'inscription n'est affichée.",
        ),
      nombre_avis: z
        .number()
        .describe(
          "Nombre d'avis affiché. 0 avec la confiance « haute » seulement si l'écran dit clairement qu'il n'y en a aucun ; 0 avec la confiance « aucune » si la zone n'est pas visible.",
        ),
      note_sur_5: z.number().describe(`Note moyenne ramenée sur 5. ${ABSENT_NOMBRE}`),
      localisation: z.string().describe(`Ville ou région affichée. ${ABSENT_TEXTE}`),
      nombre_annonces: z
        .number()
        .describe(`Nombre d'annonces du vendeur affiché. ${ABSENT_NOMBRE}`),
      profil_verifie: z
        .boolean()
        .describe(
          "true si la plateforme affiche une vérification du profil, false si elle montre explicitement qu'il n'y en a pas ; false avec la confiance « aucune » sinon.",
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
            .describe("Message recopié verbatim, sans résumé, correction ni anonymisation."),
        }),
      )
      .describe("TOUS les messages visibles, dans l'ordre."),
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
export type ReponseApi = z.infer<typeof ReponseApiSchema>;

type ConfianceApi = (typeof CONFIANCES_API)[number];
const confiancePresente = (c: ConfianceApi) => (c === "aucune" ? null : c);

/** Une donnée est absente si la confiance est « aucune » ; une chaîne vide ne vaut pas une valeur. */
function valeur<T>(v: T, c: ConfianceApi): T | null {
  if (c === "aucune") return null;
  if (typeof v === "string" && v.trim() === "") return null;
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

/**
 * Remet la réponse de l'API dans la forme interne : « aucune » et « inconnue » redeviennent `null`.
 * Une donnée vide ou illisible n'a pas de confiance non plus.
 */
export function depuisReponseApi(api: ReponseApi): ReponseModele {
  const d = api.donnees_extraites;
  const a = d.annonce;
  const v = d.vendeur;
  const ca = d.confiance.annonce;
  const cv = d.confiance.vendeur;
  const champ = <T>(x: T, c: ConfianceApi) => {
    const retenue = valeur(x, c);
    return { valeur: retenue, confiance: retenue === null ? null : confiancePresente(c) };
  };
  const titre = champ(a.titre, ca.titre);
  const prix = champ(a.prix_eur, ca.prix_eur);
  const marque = champ(a.marque, ca.marque);
  const categorie = champ(a.categorie, ca.categorie);
  const description = champ(a.description, ca.description);
  const photos = champ(a.nombre_photos, ca.nombre_photos);
  const anciennete = champ(v.anciennete_jours, cv.anciennete_jours);
  const avis = champ(v.nombre_avis, cv.nombre_avis);
  const note = champ(v.note_sur_5, cv.note_sur_5);
  const localisation = champ(v.localisation, cv.localisation);
  const annonces = champ(v.nombre_annonces, cv.nombre_annonces);
  const verifie = champ(v.profil_verifie, cv.profil_verifie);

  return {
    contenu_exploitable: api.contenu_exploitable,
    donnees_extraites: {
      plateforme: d.plateforme === "inconnue" ? null : d.plateforme,
      ecrans: d.ecrans,
      annonce: {
        titre: titre.valeur,
        prix_eur: prix.valeur,
        marque: marque.valeur,
        categorie: categorie.valeur,
        description: description.valeur,
        nombre_photos: photos.valeur,
      },
      vendeur: {
        anciennete_jours: anciennete.valeur,
        nombre_avis: avis.valeur,
        note_sur_5: note.valeur,
        localisation: localisation.valeur,
        nombre_annonces: annonces.valeur,
        profil_verifie: verifie.valeur,
      },
      messages: d.messages,
      liens: d.liens,
      confiance: {
        annonce: {
          titre: titre.confiance,
          prix_eur: prix.confiance,
          marque: marque.confiance,
          categorie: categorie.confiance,
          description: description.confiance,
          nombre_photos: photos.confiance,
        },
        vendeur: {
          anciennete_jours: anciennete.confiance,
          nombre_avis: avis.confiance,
          note_sur_5: note.confiance,
          localisation: localisation.confiance,
          nombre_annonces: annonces.confiance,
          profil_verifie: verifie.confiance,
        },
      },
    },
    score: api.score,
    niveau: api.niveau,
    signaux: api.signaux,
    rassurants: api.rassurants,
    conseils: api.conseils,
  };
}

/**
 * Schéma JSON envoyé à l'API dans `output_config.format`, généré depuis `ReponseApiSchema`.
 *
 * On ne passe PAS par `zodOutputFormat` du SDK : sa transformation (v1.3.0) ne conserve que le
 * type, la description et la structure, et recopie tous les `enum` dans le texte de la
 * description au lieu de les imposer. Les valeurs fermées (gravité, auteur, confiance, niveau)
 * ne seraient plus garanties par l'API. `z.toJSONSchema` les garde. Un test (`schema-limites`)
 * vérifie le résultat contre les limites documentées : mots-clés supportés, objets fermés,
 * au plus 16 unions et 24 paramètres optionnels.
 */
export const SCHEMA_REPONSE: Record<string, unknown> = (() => {
  // `reused: "inline"` : aucun $ref. Un $ref accompagné d'une description est ambigu pour les
  // sorties structurées, et le schéma reste petit même avec les sous-schémas répétés.
  const schema = z.toJSONSchema(ReponseApiSchema, { reused: "inline" }) as Record<string, unknown>;
  delete schema.$schema; // la version du dialecte n'est pas utile à l'API
  return schema;
})();
