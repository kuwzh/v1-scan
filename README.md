# Gardo (nom provisoire)

Web app mobile-first qui repère les **signaux d'alerte** d'arnaque sur les sites de seconde main
(Vinted, Leboncoin, Facebook Marketplace…). On envoie une ou plusieurs captures d'écran, un lien ou
le texte d'une conversation ; on reçoit un score de risque (vert / orange / rouge), les signaux
repérés et des conseils concrets.

> L'outil aide à la décision, il ne garantit rien. Il parle de « risque » et de « signaux d'alerte »,
> jamais d'accusation.

**État : étapes 0 à 6 terminées (squelette, contrats, liens, règles et scoring, client IA et évaluation, API et garde-fous, interface mobile). Il reste le partage, la PWA, la page Confidentialité et le lien d'annonce.**

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
  components/   UI (React) : Verificateur orchestre les trois écrans (saisie, chargement, résultat)
  lib/          cœur métier en TypeScript pur : aucun import de Next ni de React (règle ESLint)
    rules/      moteur de règles déterministe et pondéré (catalogue par famille, prix par marque)
    ai/         client Claude : prompt, schéma de sortie, nettoyage de la réponse, erreurs
    analyze/    pipeline, fusion règles + IA, nettoyage de la sortie de l'IA, assemblage du résultat
    eval/       métriques d'évaluation (faux positifs, extraction, auteurs, coût)
    links/      analyse statique des liens : nettoyage d'URL, liste blanche, imitation de marque,
                typosquatting, raccourcisseurs, TLD à risque (aucune requête réseau)
    security/   config des garde-fous, stockage (Upstash / mémoire), IP hashée, rate limit,
                plafond de dépense, validation des images, lecture bornée du corps
    client/     logique du navigateur sans React : compression des captures, appels à l'API, état des écrans
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
- [x] 6. UI mobile : upload, loader, écran résultat, feedback 👍👎 anonyme
- [ ] 7. Carte de partage 9:16
- [ ] 8. PWA et Web Share Target (Android)
- [ ] 9. Page Confidentialité, landing avec compteur « X annonces vérifiées »
- [ ] 10. Lien d'annonce Vinted / Leboncoin en best-effort, derrière un flag
- [ ] 11. README complet, checklist de mise en production, un test e2e Playwright (texte → résultat → vote)

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
  mode (complet ou règles seules) et la tranche de score (10 points) sous cet identifiant, pour une heure. Le premier vote le consomme de
  façon atomique ; les suivants sont refusés. Le client ne fournit jamais le score, donc il ne peut
  pas fausser les agrégats. On n'enregistre qu'un compteur par (mode, niveau, tranche, vote), clés
  `feedback:<mode>:<niveau>:<tranche>:<vote>`, relisibles avec `lireAgregatsFeedback`. Le mode est
  séparé car les scores « règles seules » n'ont pas la même distribution que les scores complets.
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

### Premier déploiement sur Vercel (preview)

À faire avant la checklist ci-dessous, qui se déroule ensuite sur l'URL de la preview. Le plan
gratuit de Vercel (Hobby) suffit.

1. **Branche de production.** Le dépôt n'a pour l'instant qu'une branche, donc Vercel la prendrait
   pour la production. Pour avoir une vraie _preview_, créer sur GitHub une branche `main` (depuis la
   branche de travail) et la définir comme branche par défaut (Settings → Branches). La branche de
   travail devient alors une preview ; `main` sera la production, avec ses propres variables.
2. **Une base Upstash par environnement.** Créer `gardo-preview` (et plus tard `gardo-prod`) dans la
   console Upstash, région européenne (Francfort ou Irlande), plan gratuit. Au choix :
   - depuis Vercel (Storage → Upstash Redis), en ne connectant la base `gardo-preview` qu'à
     l'environnement **Preview** du projet ;
   - ou à la main : console Upstash → la base → REST API → copier l'URL et le jeton, puis les ajouter
     dans Vercel (Settings → Environment Variables), cochés pour **Preview** seulement.

   Les noms `UPSTASH_REDIS_REST_URL` / `_TOKEN` et `KV_REST_API_URL` / `_TOKEN` sont tous deux
   acceptés. Le jeton « lecture seule » ne convient pas.

3. **Clé Anthropic dédiée à la preview.** Dans la console Anthropic, créer une clé à part et lui
   fixer une limite de dépense mensuelle basse (par exemple 10 $) : c'est un second filet, indépendant
   de `DAILY_SPEND_CAP_USD`. L'ajouter dans Vercel pour **Preview**, en « Sensitive ».
4. **Variables d'environnement (Preview).**

   | Variable               | Valeur                                                                |
   | ---------------------- | --------------------------------------------------------------------- |
   | `ANTHROPIC_API_KEY`    | la clé de la preview                                                  |
   | `IP_HASH_SECRET`       | `openssl rand -hex 32` (un secret différent par environnement)        |
   | Upstash                | voir l'étape 2                                                        |
   | `NEXT_PUBLIC_SITE_URL` | facultatif pour l'instant (servira à la carte de partage et à la PWA) |

   Pour tester vite : `RATE_LIMIT_PER_HOUR=3` et `DAILY_SPEND_CAP_USD=0.02`, à remettre ensuite.
   Une variable modifiée ne s'applique qu'au déploiement suivant : relancer un déploiement.

5. **Importer le projet.** Vercel → Add New → Project → choisir `kuwzh/v1-scan` (installer l'app
   GitHub de Vercel avec accès à ce dépôt si besoin). Next.js est détecté, rien à modifier. Dans
   Settings : Node.js 22, et région des fonctions proche de la base Upstash (Paris `cdg1` ou
   Francfort `fra1`).
6. **Ouvrir la preview sur le téléphone.** Les previews sont protégées par défaut (Vercel
   Authentication) : on y accède connecté à son compte Vercel, ou avec un lien partageable
   (bouton Share du déploiement). L'URL se trouve dans Deployments, filtrée sur la branche.
7. **Vérifier la configuration.** Dans Vercel → Logs, chercher `[gardo] IA désactivée` : sa présence
   veut dire qu'une variable manque (le message dit laquelle). Dans ce cas l'app répond quand même,
   en « règles seules ».

### Checklist « premier test réel »

Rien de ce qui suit n'a pu être vérifié sans identifiants : à faire une fois, dans l'ordre, avant de
mettre l'app devant du public. Soit en local (clés dans `.env.local`, jamais commité), soit sur la
preview Vercel configurée ci-dessus ; les vérifications dans la console Upstash valent pour les deux.
Pour les commandes `curl`, lancer la preview avec un lien partageable, ou tester depuis le téléphone.

**Upstash**

- [ ] Créer une base Upstash Redis, proche de la région des fonctions Vercel. Une base **séparée** pour
      les previews. Renseigner `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN`.
- [ ] Générer `IP_HASH_SECRET` (`openssl rand -hex 32`), un différent par environnement.
- [ ] `pnpm dev`, puis envoyer 11 analyses de texte depuis la même IP : la 11ᵉ doit répondre `429` avec
      un `Retry-After`.
- [ ] Dans la console Upstash, vérifier les clés : `limite:*` (TTL > 0 et ≤ 2 jours, jamais `-1`),
      `depense:<date>`, `compteur:analyses`, `analyse:<uuid>` (TTL ≈ 3 600 s). Aucune IP en clair,
      aucun texte.
- [ ] Voter deux fois avec le même `analyse_id` : `200` puis `409`. La clé `analyse:<uuid>` a disparu et
      `feedback:<mode>:<niveau>:<tranche>:<vote>` vaut 1.
- [ ] Couper Upstash (mauvais jeton) : une analyse de texte répond toujours, en « règles seules ».
- [ ] En production sans les variables Upstash : l'avertissement `[gardo] IA désactivée` apparaît dans
      les journaux et une capture seule reçoit le message qui propose de coller le texte.

**Anthropic**

- [ ] Renseigner `ANTHROPIC_API_KEY` ; garder `claude-haiku-5-5` par défaut.
- [ ] `pnpm eval` (plan, sans appel) puis `pnpm eval --run` : aucune erreur `configuration` ni
      `reponse_invalide` (c'est la preuve que le schéma de sortie est accepté), faux positifs sur les
      conversations saines, taux d'invention et calibration de la confiance.
- [ ] Comparer le coût mesuré par l'éval aux estimations : `TARIFS_MODELES` (à revérifier sur la page de
      tarifs d'Anthropic) et `estimerCoutMaximal` doivent rester au-dessus du pire coût observé. Le
      coût moyen est supposé d'environ 0,0007 $ par analyse sur Haiku ; ajuster `DAILY_SPEND_CAP_USD`
      en conséquence.
- [ ] Envoyer une vraie capture par l'app (`pnpm dev`) : le résultat est « complet » et la clé
      `depense:<date>` a augmenté d'un montant cohérent (valeur en millionièmes de dollar).
- [ ] Tester le plafond avec `DAILY_SPEND_CAP_USD=0.01` : après quelques analyses, le message « Forte
      affluence, analyse partielle » apparaît pour un texte et `plafond_atteint` pour une capture seule.
- [ ] Si l'éval montre trop d'erreurs d'extraction, passer à `ANTHROPIC_MODEL=claude-sonnet-5-5`
      (sans changement de code) et relancer l'éval.

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
