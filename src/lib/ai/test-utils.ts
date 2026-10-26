import type Anthropic from "@anthropic-ai/sdk";
import type { ReponseModele } from "./wire";

/** Réponse valide du modèle pour une conversation banale ; les tests la modifient. */
export function reponseModele(partiel: Partial<ReponseModele> = {}): ReponseModele {
  return {
    contenu_exploitable: true,
    donnees_extraites: {
      plateforme: "vinted",
      ecrans: ["annonce", "conversation"],
      annonce: {
        titre: "Pull en laine",
        prix_eur: 15,
        marque: null,
        categorie: "pull",
        description: null,
        nombre_photos: 3,
      },
      vendeur: {
        anciennete_jours: 900,
        nombre_avis: 120,
        note_sur_5: 4.9,
        localisation: null,
        nombre_annonces: null,
        profil_verifie: true,
      },
      messages: [
        { auteur: "acheteur", confiance: "haute", texte: "Bonjour, il est toujours dispo ?" },
        { auteur: "vendeur", confiance: "haute", texte: "Oui, je l'envoie demain via Vinted." },
      ],
      liens: [],
      confiance: {
        annonce: {
          titre: "haute",
          prix_eur: "haute",
          marque: null,
          categorie: "moyenne",
          description: null,
          nombre_photos: "haute",
        },
        vendeur: {
          anciennete_jours: "moyenne",
          nombre_avis: "haute",
          note_sur_5: "haute",
          localisation: null,
          nombre_annonces: null,
          profil_verifie: "haute",
        },
      },
    },
    score: 8,
    niveau: "faible",
    signaux: [],
    rassurants: [{ label: "Le compte existe depuis plusieurs années." }],
    conseils: ["Reste dans la messagerie de la plateforme."],
    ...partiel,
  };
}

interface OptionsMessage {
  texte?: string | null;
  stop_reason?: Anthropic.Message["stop_reason"];
  usage?: Partial<Anthropic.Usage>;
  categorieRefus?: string;
}

/** `Anthropic.Message` minimal, suffisant pour ce que lit l'évaluateur. */
export function messageFactice(options: OptionsMessage = {}): Anthropic.Message {
  const { texte, stop_reason = "end_turn", usage = {}, categorieRefus } = options;
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-5-5",
    content: texte === null ? [] : [{ type: "text", text: texte ?? "{}", citations: null }],
    stop_reason,
    stop_sequence: null,
    stop_details: categorieRefus
      ? { type: "refusal", category: categorieRefus, explanation: null }
      : null,
    usage: {
      input_tokens: 1200,
      output_tokens: 600,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      ...usage,
    },
  } as unknown as Anthropic.Message;
}
