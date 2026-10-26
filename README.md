# Gardo (nom provisoire)

Web app mobile-first qui repère les **signaux d'alerte** d'arnaque sur les sites de seconde main
(Vinted, Leboncoin, Facebook Marketplace…). On envoie une ou plusieurs captures d'écran, un lien ou
le texte d'une conversation ; on reçoit un score de risque (vert / orange / rouge), les signaux
repérés et des conseils concrets.

> L'outil aide à la décision, il ne garantit rien. Il parle de « risque » et de « signaux d'alerte »,
> jamais d'accusation.

**État : étapes 0 à 3 terminées (squelette, contrats, analyseur de liens, moteur de règles et scoring). L'app n'est pas encore fonctionnelle.**

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
    ai/         client IA, prompt, schéma zod, parsing
    rules/      moteur de règles déterministe et pondéré (catalogue par famille, prix par marque)
    analyze/    fusion règles + IA, nettoyage de la sortie de l'IA, assemblage du résultat
    links/      analyse statique des liens : nettoyage d'URL, liste blanche, imitation de marque,
                typosquatting, raccourcisseurs, TLD à risque (aucune requête réseau)
    security/   rate limit, validation d'image, garde anti-SSRF
```

`src/lib` est volontairement indépendant du framework : il pourra être réutilisé tel quel par une
extension Chrome ou une API B2B. L'API sera versionnée (`/api/v1/...`) pour la même raison.

## Feuille de route

- [x] 0. Squelette : Next, TypeScript, Tailwind, Vitest, ESLint, CI
- [x] 1. Contrats : schémas zod, textes français
- [x] 2. Analyseur de liens et de domaines
- [x] 3. Moteur de règles et scoring
- [ ] 4. Client IA (extraction + évaluation, JSON structuré)
- [ ] 5. Route `/api/v1/analyze`, rate limit, plafond de dépense, compteur d'analyses, route de feedback
- [ ] 6. UI mobile : upload, loader, écran résultat, feedback 👍👎 anonyme
- [ ] 7. Carte de partage 9:16
- [ ] 8. PWA et Web Share Target (Android)
- [ ] 9. Page Confidentialité, landing avec compteur « X annonces vérifiées »
- [ ] 10. Lien d'annonce Vinted / Leboncoin en best-effort, derrière un flag
- [ ] 11. README complet et checklist de mise en production

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
