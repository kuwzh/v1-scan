# Leonida Map (nom provisoire)

Site fan **non officiel** en français : carte interactive de GTA 6 (Leonida), missions, collectibles,
véhicules et guides. Aucun contenu Rockstar (logos, polices, artworks, captures).

Stack : Next.js (App Router) · TypeScript · Tailwind 4 · Supabase · Leaflet (CRS.Simple).

## Démarrer

```bash
cd gta-map
npm install
cp .env.example .env.local
npm run dev
```

## Base de données

Migrations dans `supabase/migrations/` (appliquer avec `supabase db push` ou l'éditeur SQL), seed
placeholder dans `supabase/seed.sql`. Pour créer un admin :

```sql
insert into public.admin_users select id from auth.users where email = 'toi@exemple.fr';
```

Coordonnées des marqueurs : normalisées (0..1, y = 0 en haut), indépendantes de la résolution de la carte.

## Déploiement Vercel

Le projet est dans un sous-dossier : régler **Root Directory = `gta-map`**.

## Avancement

- [x] 1. Projet + base de données (migrations, RLS, seed, types)
- [ ] 2. Carte  - [ ] 3. Progression  - [ ] 4. Pages SEO  - [ ] 5. Admin  - [ ] 6. Design
