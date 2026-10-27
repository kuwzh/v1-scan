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
    partage/    carte de partage 9:16 : données affichées (`carte.ts`) et dessin canvas (`dessin.ts`)
    prix/       comparaison de prix : recherche web (Claude + `web_search`), seuils, cache, recalcul du score
    client/     logique du navigateur sans React : compression des captures, appels à l'API, état des écrans
    api/        les handlers `traiterAnalyse`, `traiterPrix`, `traiterFeedback`, `traiterStats` : Request → Response,
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
- [x] Comparaison de prix à la demande (recherche web, cache 24 h, signal « importante » / « attention » ; voir plus bas)
- [x] 7. Carte de partage 9:16 (canvas côté navigateur, Web Share API avec fichier, repli téléchargement / aperçu iPhone)
- [ ] 8. PWA et Web Share Target (Android)
- [ ] 9. Page Confidentialité, landing avec compteur « X annonces vérifiées »
- [ ] 10. Lien d'annonce Vinted / Leboncoin en best-effort, derrière un flag
- [ ] 11. README complet, checklist de mise en production (dont `SHOW_DIAGNOSTICS=false`), un test e2e Playwright (texte → résultat → vote)

## API

| Route                   | Rôle                                                                                                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/analyze`  | `multipart/form-data` : `images` (≤ 3), `texte`, `lien`, `site` (`vinted`, `leboncoin`, `facebook_marketplace`, `autre`). Renvoie `{ analyse_id, resultat, partielle, avis, comparaison_prix }`.                                                                                                          |
| `POST /api/v1/prix`     | JSON `{ analyse_id }`. Compare le prix de l'annonce à ceux du neuf et de l'occasion (recherche web) ; renvoie `{ statut, estimation, comparaison, signal, resultat: { score, niveau, signaux_retires }, depuis_cache }`. Proposé seulement si `comparaison_prix.disponible` dans la réponse de `analyze`. |
| `POST /api/v1/feedback` | JSON `{ analyse_id, vote: "up" \| "down" }`. Un vote par analyse.                                                                                                                                                                                                                                         |
| `GET /api/v1/health`    | État de la configuration, sans aucune valeur secrète : `anthropic`, `upstash` (`absent` / `present` / `joignable`), `ip_secret`, `ia_active`, `modele`, plus `manque` (les variables à définir), `raison_inactive`, `environnement`, `plafond_usd` et `depense_du_jour_usd`. Gardé 30 s.                  |
| `GET /api/v1/stats`     | `{ analyses }` : le compteur public, mis en cache (CDN et mémoire).                                                                                                                                                                                                                                       |

Les erreurs ont toujours la forme `{ erreur: { code, message } }` (codes dans `src/lib/contracts/errors.ts`).

### Garde-fous

Valeurs de départ, toutes réglables dans l'environnement (voir `.env.example`).

- **Rate limit** : 10 analyses par heure et 30 par jour et par IP (`RATE_LIMIT_PER_HOUR`,
  `RATE_LIMIT_PER_DAY`), en fenêtre glissante. Au-delà : `429` avec `Retry-After`. Appliqué avant de
  lire le corps de la requête. Une demande refusée n'est pas décomptée. L'IP n'est jamais stockée :
  seule une empreinte HMAC (secret `IP_HASH_SECRET`) sert de clé, avec une durée de vie de 2 jours au
  plus. En IPv6, c'est le préfixe /64 qui est limité.
- **Plafond de dépense** : 1 $/jour (`DAILY_SPEND_CAP_USD`, jour UTC), tous visiteurs confondus : de
  l'ordre de 1 000 analyses à 0,0007 $, ou une quarantaine de comparaisons de prix à 0,02 $. Avant
  chaque appel à l'IA, le coût maximal possible est _réservé_ de façon atomique, puis remplacé par le
  coût réel : même avec des appels simultanés, le plafond ne peut pas être dépassé de plus qu'une
  erreur d'estimation. Au-delà, l'IA est coupée : un texte reçoit une analyse « règles seules »
  accompagnée du message « Forte affluence, analyse partielle » ; des captures seules (illisibles sans
  IA) reçoivent l'erreur `plafond_atteint`, qui invite à coller le texte de la conversation.
- **Comparaison de prix** : une recherche web coûte 0,01 $ pièce, plus les jetons (les résultats de
  recherche sont lus en entrée). Elle compte dans le même plafond : le pire cas (3 recherches,
  60 000 jetons en entrée, réponse maximale ≈ 0,04 $ sur Haiku) est réservé avant l'appel, puis
  remplacé par le coût réel (recherches facturées + jetons). Limite propre aux recherches : 5 par
  heure et 15 par jour et par IP (`PRICE_RATE_LIMIT_PER_HOUR`, `PRICE_RATE_LIMIT_PER_DAY`) ; une
  estimation déjà en cache ne la consomme pas, et tous les appels restent bornés à 30/h et 100/j.
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

1. **Branche de production.** La branche `main` existe (créée depuis la branche de travail). Il reste
   à la définir comme branche par défaut sur GitHub (Settings → Branches) : la branche de travail
   devient alors une _preview_, et `main` la production, avec ses propres variables.
   **Région des fonctions.** `vercel.json` fixe `"regions": ["fra1"]` (Francfort), près d'Upstash. Le
   plan Hobby n'autorise qu'une région, et Next.js n'a aucun réglage de région qui entre en conflit
   (aucun `preferredRegion`, aucune clé `functions` dans `vercel.json`). `vercel.json` l'emporte sur
   le réglage de région du tableau de bord Vercel.
2. **Une base Upstash par environnement.** Créer `gardo-preview` (et plus tard `gardo-prod`) dans la
   console Upstash, région européenne (Francfort de préférence, comme les fonctions), plan gratuit. Au choix :
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
7. **Vérifier la configuration.** Ouvrir `/api/v1/health` : `ia_active` doit être `true`. Sinon,
   `manque` liste les variables à définir et `raison_inactive` donne la cause. Dans Vercel → Logs, la
   ligne `[gardo] IA désactivée` dit la même chose. L'app répond quand même, en « règles seules »
   (avec un « Pourquoi ? » qui nomme les variables manquantes).

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
- [ ] `pnpm check:anthropic` (clé dans l'environnement ou `.env.local`) : vérifie le schéma de sortie
      hors ligne contre les limites documentées d'Anthropic, puis fait deux appels réels (texte, puis
      une capture de `evals/images`) et affiche la transcription obtenue. En cas de refus, la ligne
      `détail` donne le type et le message exacts de l'API. `--hors-ligne` ne vérifie que le schéma,
      sans clé ; `--sans-image`, `--sans-prix`, `--model`, `--effort`, `--image` ajustent l'appel. Le
      cas « prix » (outil `web_search`) coûte environ 0,02 à 0,04 $ : un iPhone 13, avec les sources
      trouvées et un score simulé pour une annonce à 150 €.
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
- [ ] Comparaison de prix : dans l'app, analyser une capture d'article identifiable (marque ET modèle
      lisibles), cliquer « Comparer le prix » ; vérifier la carte (chiffres plausibles, sources qui
      s'ouvrent), le score mis à jour, la clé `depense:<date>` (≈ 0,02 à 0,04 $ de plus) et
      `prix:<marque>:<modèle>:<état>` (TTL ≈ 86 400 s). Un second clic sur le même article dit
      « estimation récente » et ne coûte rien. Vérifier aussi que l'outil de recherche web est
      autorisé pour l'organisation Anthropic.
- [ ] Carte de partage, sur un iPhone réel (Safari, puis une appli de story) : voir le compte rendu de
      l'étape 7 ; en résumé, partager vers Instagram / Snap / TikTok, enregistrer dans Photos, et
      vérifier la carte dans une story (rien de coupé en haut ni en bas).
- [ ] Si l'éval montre trop d'erreurs d'extraction, passer à `ANTHROPIC_MODEL=claude-sonnet-5-5`
      (sans changement de code) et relancer l'éval.

## Carte de partage

Le bouton « Partager le résultat » de l'écran résultat produit une image **1080 × 1920** (story TikTok,
Instagram, Snap) : logo et adresse du site, jauge colorée avec le score et le niveau, les 3 signaux les
plus graves en phrases courtes (+ « N autres signaux »), un rassurant, le site analysé, l'écart de prix
si la comparaison a été faite (« −65 % vs prix d'occasion habituel »), l'accroche « Vérifie tes
annonces avant de payer → adresse » et la mention « Estimation, aide à la décision ». Fond sombre,
mêmes couleurs que l'app, même pile de polices (déjà présente sur l'appareil, rien à charger).

- **100 % côté client.** `genererImage` dessine dans un canvas local ; rien n'est envoyé au serveur ni
  mis dans une URL. L'image est un PNG de 1080 × 1920 px quelle que soit la densité de l'écran : elle
  n'est jamais affichée par le canvas, donc pas de mise à l'échelle ; l'aperçu est une vraie `<img>`.
- **Confidentialité par construction.** Le dessin ne reçoit que `DonneesCarte` (`carte.ts`) : jamais la
  capture (`drawImage` n'est pas utilisé, un test le vérifie), jamais le texte libre de l'analyse. Les
  signaux de l'IA peuvent citer un pseudo ou un message, et certains libellés de règles contiennent un
  prix exact ou un domaine : la carte n'utilise donc que des **phrases fixes par identifiant de règle**
  (`fr.partage`). Les signaux de l'IA ne sont comptés que dans « + N autres signaux ». Un test impose une
  phrase pour chaque règle du code (une nouvelle règle sans phrase fait échouer la CI). Aucun montant :
  seul l'écart de prix apparaît, arrondi à 5 %, et seulement pour une estimation fiable.
- **Partage.** `navigator.canShare({ files })` puis `navigator.share` avec le PNG (mobile). L'image est
  préparée dès l'affichage du résultat : Safari refuse `share()` si trop de temps s'écoule après le
  clic. Si la personne ferme la feuille, rien ne se passe. Sans partage de fichier : **iPhone / iPad**
  → un aperçu avec la consigne d'appui long (« Ajouter à Photos »), car un fichier téléchargé sur iOS
  va dans Fichiers et non dans Photos ; **ailleurs** → téléchargement de `gardo-resultat.png`.
- **Mise en page.** Contenu hors des zones couvertes par l'interface des stories (haut ~250 px). Si les
  signaux sont longs, le contenu se resserre (sans le décompte, puis une ligne par signal, puis sans
  rassurant) plutôt que de recouvrir l'accroche ; une adresse très longue est réduite puis tronquée.
- **Adresse affichée** : l'hôte de `NEXT_PUBLIC_SITE_URL` (lue à la compilation), sinon
  `v1-scan.vercel.app`.

## Comparaison de prix

Sur l'écran résultat, un bouton « Comparer le prix » (jamais automatique : la recherche est le poste
de dépense le plus cher) affiche une carte « Prix » : _prix neuf estimé ~X €, occasion habituelle
~Y–Z €, cette annonce est à −N % du prix d'occasion habituel_, avec les sources cliquables et la
mention « estimation ».

- **Quand le bouton apparaît** : marque ET modèle lus avec une confiance **haute**, et un prix lu avec
  une confiance au moins moyenne (`produitComparable`, `src/lib/prix/produit.ts`), analyse « complète »,
  et recherche possible (clé d'API, plafond, stockage partagé). Sinon seule la table de prix par marque
  (`src/lib/rules/prix.ts`) joue, comme avant.
- **Estimation** (`src/lib/prix/estimer.ts`) : un appel Claude avec l'outil `web_search_20250305`
  (`max_uses` 3, localisé en France). Le modèle ne reçoit **jamais le prix de l'annonce** : il estime
  le marché sans s'y ancrer, la comparaison se fait côté serveur. Il écrit un JSON
  `{ article_identifie, prix_neuf_eur, occasion_min_eur, occasion_max_eur, confiance, sources, remarque }`,
  validé avec zod. **Les sorties structurées ne sont pas combinées avec `web_search`** (les citations de
  l'outil y sont incompatibles) : si le JSON est illisible, un second appel sans outil le reconvertit
  avec le schéma garanti (un millième de dollar) plutôt que de perdre la recherche. Une longue recherche
  mise en pause (`pause_turn`) est reprise, deux fois au plus, dans un délai total de 50 s
  (`PRICE_TIMEOUT_MS`).
- **Anti-invention** : une source n'est gardée que si c'est une page https que la recherche a
  réellement renvoyée ; sans aucune source vérifiée, ou avec une fourchette d'occasion bien au-dessus du
  prix neuf, la confiance tombe à « basse », et une confiance basse n'a **aucun effet sur le score**
  (les chiffres s'affichent avec « estimation peu sûre »). Le texte des pages web est traité comme une
  donnée, jamais comme une consigne.
- **Règle** : prix de l'annonce **< 40 %** du bas de la fourchette d'occasion → signal `prix.web`
  « importante » (poids 0,38) ; **de 40 à 60 %** (bornes comprises) → « attention » (poids 0,22) ;
  au-delà, rien. **Jamais « critique »** : un prix bas peut venir d'un article abîmé, incomplet ou mal
  identifié, et seul un signal critique impose un plancher au score.
- **Intégration au score** : l'analyse garde une heure (`produit:<analyse_id>`) l'article, le prix et les
  poids des signaux des règles. La comparaison recalcule le score avec les mêmes formules (cumul des
  poids, fusion avec l'IA, remise, plancher) sans relancer l'analyse. Le signal remplace celui de la
  table de prix (`prix.tres_bas` / `prix.bas`) s'il est au moins aussi grave ; sinon la table reste (on
  ne baisse pas le risque sur la foi d'une estimation) et rien n'est compté deux fois.
- **Cache** : par (marque, modèle, état) pendant 24 h (`PRICE_CACHE_TTL_S`), clé `prix:<marque>:<modèle>:<état>`
  dans Upstash ; un « introuvable » ou une estimation de confiance basse est gardé 2 h au plus. Le cache ne contient que l'estimation : ni le
  prix de l'annonce, ni rien de la conversation.

**Pas encore couvert** : le prix d'une annonce lue à partir d'un lien (étape 10, pas encore faite) ; seuls
les articles lus sur une capture ou un texte collé sont comparés.

**À vérifier avec une vraie clé** (rien de cela n'a pu l'être sans identifiants) : `pnpm check:anthropic`
fait un cas réel (iPhone 13 128 Go, bon état), affiche les sources, les jetons, les recherches
facturées et le coût. Il dira si Haiku 5.5 accepte `web_search_20250305` ; sinon, `ANTHROPIC_PRICE_MODEL=claude-sonnet-5-5`.

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
   10 points. Dès qu'une des deux sources voit « élevé » (ou « moyen »), ils ne font jamais passer le
   score à un niveau inférieur, et ne passent jamais sous le plancher. Les rassurants tirés des
   messages ou cités par l'IA sont affichés sans effet sur le score.
5. **Niveau** : déduit du score final (0–29 faible, 30–59 moyen, 60–100 élevé).

**Le site compte.** L'utilisateur choisit le site (Vinted par défaut) ; ce que l'IA lit sur une capture
prime sur ce choix. Sur Leboncoin et Marketplace, où l'on paie et remet souvent en direct, les signaux
de paiement, de téléphone et d'e-mail ont un poids réduit. Sur Vinted, sur « Autre » et quand le site
est inconnu, ce sont les poids stricts : proposer PayPal est une sortie de plateforme (même poids que
WhatsApp), donc « moyen » au minimum, quelle que soit l'IA.

**Les liens** (`src/lib/links`) : ceux du champ lien et ceux du texte collé passent toujours par
l'analyseur, que l'IA les ait rapportés ou non. La lecture du _contenu_ d'une annonce à partir d'un lien
n'est pas encore disponible : un lien Vinted, Leboncoin ou Marketplace seul reçoit le message « Lecture
d'annonce bientôt disponible » ; accompagné de texte ou de captures, l'analyse a lieu et un avis le
rappelle.

**Les règles lisent aussi le texte brut.** Avec une IA active, les règles voient les messages qu'elle a
rapportés _et_ le texte collé, comme filet si elle en oublie un. On en retire ce que dit l'utilisateur :
les lignes « Moi : » et les messages que l'IA a attribués à l'acheteur, pour qu'une question comme « Tu
acceptes PayPal ? » ne soit pas prise pour une demande du vendeur. Un signal vu deux fois ne compte
qu'une fois. (« Acheteur : » n'est pas retiré : si l'utilisateur vend, c'est son interlocuteur.)

**Transcription des captures.** Le prompt demande à l'IA de transcrire _tous_ les messages, verbatim
(mots, ponctuation, fautes, émojis, noms et pseudos, sans anonymiser), dans l'ordre, sans résumer la
suite d'une longue conversation. Jusqu'à 150 messages de 4 000 caractères sont conservés. Cela
allonge la réponse : `ANTHROPIC_MAX_TOKENS=8000` et `ANTHROPIC_TIMEOUT_MS=30000` par défaut ; mesurer la
latence avec `pnpm eval --run` avant de s'engager sur « moins de 10 s ».

**Schéma de sortie.** Le schéma envoyé à Anthropic (`output_config.format`) est écrit pour les limites
documentées des sorties structurées : objets fermés, tout requis, aucune borne ni longueur, et **au plus
16 paramètres avec union** (`anyOf` ou nullable). Une donnée absente n'est donc pas `null` mais signalée
par la confiance « aucune » (valeur neutre ignorée), la plateforme inconnue par « inconnue » ;
`depuisReponseApi` remet des `null`. La validation stricte des valeurs se fait côté serveur avec zod
(`ReponseApiSchema`, puis `AiEvaluationSchema`). Un test et `pnpm check:anthropic` comptent les unions et
refusent tout schéma que l'API rejetterait. Un refus d'Anthropic est journalisé avec son type, son
message et son identifiant de requête (clés et données encodées masquées, jamais le contenu).

**Quand l'IA n'a pas servi**, le résultat dit pourquoi (`partielle.diagnostic`, et `erreur.diagnostic`
pour des captures seules) : _toutes_ les variables manquantes d'un coup (`ANTHROPIC_API_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `IP_HASH_SECRET`), ou le code HTTP d'Anthropic.
C'est le comportement par défaut, partout. **Avant d'ouvrir l'app au public, mettre
`SHOW_DIAGNOSTICS=false`** : l'utilisateur ne voit alors qu'une phrase générale qui ne révèle rien de la
configuration. Les échecs liés à la configuration (clé refusée, schéma rejeté) sont aussi écrits dans
les journaux, sans contenu.

Les seuils et poids sont des valeurs de départ, à calibrer avec les fixtures
(`src/lib/rules/fixtures`) puis avec le retour des utilisateurs.

## Vie privée

Aucune capture n'est stockée : elles sont traitées en mémoire pendant la requête. Les seules données
conservées sont, pour une heure, l'article d'une analyse comparable (marque, modèle, catégorie, état,
prix, et des nombres pour recalculer le score : clé `produit:<uuid>`, sans conversation ni capture), pour
24 h l'estimation de prix d'un article (clé `prix:…`, sans le prix de l'annonce), et des agrégats anonymes (compteur d'analyses, votes de feedback sous forme de score
arrondi, niveau et vote, sans aucun contenu) et des compteurs de rate limiting sur une IP hashée à
durée de vie courte. La carte de partage est dessinée dans le navigateur : rien n'est envoyé au serveur. La recherche de prix envoie à l'API d'Anthropic la marque, le modèle, la catégorie
et l'état de l'article (jamais le prix de l'annonce ni la conversation). Les détails figureront sur la
page Confidentialité.
