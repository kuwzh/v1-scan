# Gardo (nom provisoire)

Web app mobile-first qui repère les **signaux d'alerte** d'arnaque sur les sites de seconde main
(Vinted, Leboncoin, Facebook Marketplace…). On envoie une ou plusieurs captures d'écran, un lien ou
le texte d'une conversation ; on reçoit un score de risque (vert / orange / rouge), les signaux
repérés et des conseils concrets.

> L'outil aide à la décision, il ne garantit rien. Il parle de « risque » et de « signaux d'alerte »,
> jamais d'accusation.

**État : étapes 0 à 5 terminées (squelette, contrats, liens, règles et scoring, client IA et évaluation, API et garde-fous). L'API fonctionne ; l'interface arrive à l'étape 6.**

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS 4 · Vitest · pnpm · déploiement Vercel.
IA : API Claude (vision), appelée uniquement côté serveur. Upstash Redis pour le rate limiting et
les agrégats anonymes.

## Démarrer

```bash
pnpm install
cp .env.example .env.local   # puis remplir les valeurs
pnpm dev                     # http://localhost:3000
```

| Commande         | Rôle                     |
| ---------------- | ------------------------ |
| `pnpm dev`       | serveur de développement |
| `pnpm build`     | build de production      |
| `pnpm lint`      | ESLint                   |
| `pnpm typecheck` | TypeScript               |
| `pnpm test`      | tests unitaires (Vitest) |
| `pnpm format`    | Prettier                 |

Node 22 recommandé (`.nvmrc`). Les variables d'environnement sont documentées dans `.env.example`.

## Architecture

```
src/
  app/          pages et routes API (Next.js)
  components/   UI
  lib/          cœur métier en TypeScript pur : aucun import de Next ni de React (règle ESLint)
    rules/      moteur de règles déterministe et pondéré (catalogue par famille, prix par marque)
    ai/         client Claude : prompt, schéma de sortie, nettoyage de la réponse, erreurs
    analyze/    pipeline, fusion règles + IA, nettoyage de la sortie de l'IA, assemblage du résultat
    eval/       métriques d'évaluation (faux positifs, extraction, auteurs, coût)
    links/      analyse statique des liens : nettoyage d'URL, liste blanche, imitation de marque,
                typosquatting, raccourcisseurs, TLD à risque (aucune requête réseau)
    security/   config des garde-fous, stockage (Upstash / mémoire), IP hashée, rate limit,
                plafond de dépense, validation des images, lecture bornée du corps
    api/        les handlers `traiterAnalyse`, `traiterFeedback`, `traiterStats` : Request → Response,
                sans Next ; les routes de `src/app/api/v1/` ne font que les appeler
```

`src/lib` est volontairement indépendant du framework : il pourra être réutilisé tel quel par une
extension Chrome ou une API B2B. L'API sera versionnée (`/api/v1/...`) pour la même raison.

## Feuille de route

- [x] 0. Squelette : Next, TypeScript, Tailwind, Vitest, ESLint, CI
- [x] 1. Contrats : schémas zod, textes français
- [x] 2. Analyseur de liens et de domaines
- [x] 3. Moteur de règles et scoring
- [x] 4. Client IA (extraction + évaluation, JSON structuré) et script d'évaluation
- [x] 5. Route `/api/v1/analyze`, rate limit, plafond de dépense, compteur d'analyses, route de feedback
- [ ] 6. UI mobile : upload, loader, écran résultat, feedback 👍👎 anonyme
- [ ] 7. Carte de partage 9:16
- [ ] 8. PWA et Web Share Target (Android)
- [ ] 9. Page Confidentialité, landing avec compteur « X annonces vérifiées »
- [ ] 10. Lien d'annonce Vinted / Leboncoin en best-effort, derrière un flag
- [ ] 11. README complet et checklist de mise en production

## API

| Route                   | Rôle                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/analyze`  | `multipart/form-data` : `images` (≤ 3), `texte`, `lien`. Renvoie `{ analyse_id, resultat, partielle }`. |
| `POST /api/v1/feedback` | JSON `{ analyse_id, vote: "up" \| "down" }`. Un vote par analyse.                                       |
| `GET /api/v1/stats`     | `{ analyses }` : le compteur public, mis en cache (CDN et mémoire).                                     |

Les erreurs ont toujours la forme `{ erreur: { code, message } }` (codes dans `src/lib/contracts/errors.ts`).

### Garde-fous

Valeurs de départ, toutes réglables dans l'environnement (voir `.env.example`).

- **Rate limit** : 10 analyses par heure et 30 par jour et par IP (`RATE_LIMIT_PER_HOUR`,
  `RATE_LIMIT_PER_DAY`), en fenêtre glissante. Au-delà : `429` avec `Retry-After`. Appliqué avant de
  lire le corps de la requête. Une demande refusée n'est pas décomptée. L'IP n'est jamais stockée :
  seule une empreinte HMAC (secret `IP_HASH_SECRET`) sert de clé, avec une durée de vie de 2 jours au
  plus. En IPv6, c'est le préfixe /64 qui est limité.
- **Plafond de dépense** : 5 $/jour (`DAILY_SPEND_CAP_USD`, jour UTC), tous visiteurs confondus. Avant
  chaque appel à l'IA, le coût maximal possible est _réservé_ de façon atomique, puis remplacé par le
  coût réel : même avec des appels simultanés, le plafond ne peut pas être dépassé de plus qu'une
  erreur d'estimation. Au-delà, l'IA est coupée : un texte reçoit une analyse « règles seules »
  accompagnée du message « Forte affluence, analyse partielle » ; des captures seules (illisibles sans
  IA) reçoivent l'erreur `plafond_atteint`, qui invite à coller le texte de la conversation.
- **Feedback** : chaque analyse renvoie un `analyse_id` aléatoire. Le serveur retient seulement la
  tranche de score (10 points) sous cet identifiant, pour une heure. Le premier vote le consomme de
  façon atomique ; les suivants sont refusés. Le client ne fournit jamais le score, donc il ne peut
  pas fausser les agrégats. On n'enregistre qu'un compteur par (niveau, tranche, vote), clés
  `feedback:<niveau>:<tranche>:<vote>`, relisibles avec `lireAgregatsFeedback`.
- **Compteur public** : un entier incrémenté à chaque analyse réussie, relu au plus toutes les
  `COUNTER_CACHE_SECONDS` secondes (5 minutes) par instance, et mis en cache par le CDN.
- **Images** : trois au plus, 1,3 Mo chacune, 3,6 Mo au total. Le format est vérifié d'après les
  premiers octets (JPEG, PNG, WebP), jamais d'après le type annoncé par le client. Le corps est lu
  en flux et abandonné dès que 3,8 Mo sont dépassés.
- **Requêtes d'autres sites** : refusées (`Sec-Fetch-Site: cross-site`), pour qu'une page tierce ne
  puisse pas faire payer l'IA via les navigateurs de ses visiteurs.

**Sans Upstash, l'IA est coupée en production.** Le rate limit et le plafond de dépense n'ont de
valeur que partagés entre toutes les instances : sans `UPSTASH_REDIS_REST_URL`/`_TOKEN` (et
`IP_HASH_SECRET`), une instance serverless compterait de son côté. Dans ce cas, l'app reste utilisable
en « règles seules » et un avertissement de configuration (sans aucun contenu) est écrit une fois dans
le journal. En développement, un repli en mémoire est utilisé. Si Upstash tombe en cours de route,
même comportement : les analyses restent servies sans IA.

## Comment le score est calculé

1. **Règles** (`src/lib/rules`) : chaque signal a une gravité (`info` < `attention` < `importante` <
   `critique`) et un poids dans une bande propre à sa gravité. Le score des règles cumule les poids
   comme des probabilités : `100 × (1 − ∏(1 − poids))`.
2. **Plancher** : un signal `critique` impose un plancher (70 à 85) sous lequel le score ne descend
   jamais. Seules les règles déterministes peuvent être critiques ; l'IA n'émet que `info`,
   `attention` ou `importante`, donc un texte piégé ne peut pas agir sur le plancher.
3. **Fusion avec l'IA** (`src/lib/analyze/fusion.ts`) : moyenne des deux scores, sans descendre de plus de
   10 points sous la source la plus sévère. Sans IA, c'est le score des règles.
4. **Rassurants** : ceux qui viennent du profil (compte ancien, avis, profil vérifié) retirent au plus
   10 points. Ils ne font jamais passer un score de « élevé » à « moyen » et ne passent jamais sous le
   plancher. Les rassurants tirés des messages ou cités par l'IA sont affichés sans effet sur le score.
5. **Niveau** : déduit du score final (0–29 faible, 30–59 moyen, 60–100 élevé).

Les seuils et poids sont des valeurs de départ, à calibrer avec les fixtures
(`src/lib/rules/fixtures`) puis avec le retour des utilisateurs.

## Vie privée

Aucune capture n'est stockée : elles sont traitées en mémoire pendant la requête. Les seules données
conservées sont des agrégats anonymes (compteur d'analyses, votes de feedback sous forme de score
arrondi, niveau et vote, sans aucun contenu) et des compteurs de rate limiting sur une IP hashée à
durée de vie courte. Les détails figureront sur la page Confidentialité.
