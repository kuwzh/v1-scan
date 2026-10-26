# Gardo (nom provisoire)

Web app mobile-first qui repère les **signaux d'alerte** d'arnaque sur les sites de seconde main
(Vinted, Leboncoin, Facebook Marketplace…). On envoie une ou plusieurs captures d'écran, un lien ou
le texte d'une conversation ; on reçoit un score de risque (vert / orange / rouge), les signaux
repérés et des conseils concrets.

> L'outil aide à la décision, il ne garantit rien. Il parle de « risque » et de « signaux d'alerte »,
> jamais d'accusation.

**État : étape 0 (squelette) terminée. L'app n'est pas encore fonctionnelle.**

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
    rules/      moteur de règles déterministe et pondéré
    links/      analyse de domaines et de liens
    security/   rate limit, validation d'image, garde anti-SSRF
```

`src/lib` est volontairement indépendant du framework : il pourra être réutilisé tel quel par une
extension Chrome ou une API B2B. L'API sera versionnée (`/api/v1/...`) pour la même raison.

## Feuille de route

- [x] 0. Squelette : Next, TypeScript, Tailwind, Vitest, ESLint, CI
- [x] 1. Contrats : schémas zod, textes français
- [ ] 2. Analyseur de liens et de domaines
- [ ] 3. Moteur de règles et scoring
- [ ] 4. Client IA (extraction + évaluation, JSON structuré)
- [ ] 5. Route `/api/v1/analyze`, rate limit, plafond de dépense, compteur d'analyses, route de feedback
- [ ] 6. UI mobile : upload, loader, écran résultat, feedback 👍👎 anonyme
- [ ] 7. Carte de partage 9:16
- [ ] 8. PWA et Web Share Target (Android)
- [ ] 9. Page Confidentialité, landing avec compteur « X annonces vérifiées »
- [ ] 10. Lien d'annonce Vinted / Leboncoin en best-effort, derrière un flag
- [ ] 11. README complet et checklist de mise en production

## Vie privée

Aucune capture n'est stockée : elles sont traitées en mémoire pendant la requête. Les seules données
conservées sont des agrégats anonymes (compteur d'analyses, votes de feedback sous forme de score
arrondi, niveau et vote, sans aucun contenu) et des compteurs de rate limiting sur une IP hashée à
durée de vie courte. Les détails figureront sur la page Confidentialité.
