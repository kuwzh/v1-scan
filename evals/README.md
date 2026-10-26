# Évaluation de Gardo

Mesure la qualité de l'analyse sur un jeu de conversations et de captures. La métrique qui compte
le plus est le **taux de faux positifs sur les conversations saines** : une alerte à tort fait
perdre la confiance des utilisateurs bien plus vite qu'une alerte manquée. Elle est mesurée à part
et affichée en premier.

```bash
pnpm eval                      # plan et coût estimé, AUCUN appel à l'API
pnpm eval --regles-seules      # règles seules sur les textes : gratuit, sans clé
pnpm eval --run                # évaluation complète avec l'IA (appels payants, clé requise)
pnpm eval --run --only sains   # seulement les conversations saines
pnpm eval --run --model claude-sonnet-5-5 --repeat 3
```

La clé se met dans `.env.local` (`ANTHROPIC_API_KEY`). Le modèle par défaut est
`claude-haiku-5-5` ; pour comparer avec Sonnet, passer `--model claude-sonnet-5-5`.
Avec Haiku, les 59 cas coûtent de l'ordre de quelques centimes.

## Ce qui est mesuré

1. **Faux positifs** sur les conversations saines : part qui déclenche une alerte (niveau moyen ou
   élevé), part qui déclenche une alerte forte (élevé ou signal critique), par groupe (`ordinaire`,
   `piege`), et d'où vient l'alerte (règles, IA, les deux). Les cas en cause sont listés avec leurs
   signaux. Une erreur d'analyse n'est ni un succès ni un faux positif : elle est comptée à part.
2. **Détection** des conversations suspectes, pour vérifier qu'on ne gagne pas en faux positifs en
   perdant les vraies alertes.
3. **Extraction** (captures et textes avec attentes) : exactitude, **taux d'invention** (une valeur
   là où `null` était attendu), calibration de la confiance annoncée, attribution des auteurs
   (acheteur pris pour le vendeur, auteur deviné alors qu'inconnu), messages inventés.
4. **Coût et délais** de l'IA.

Le code de sortie est non nul si un objectif n'est pas atteint (`--sans-verdict` pour l'ignorer).
Objectifs par défaut, modifiables : faux positifs ≤ 10 %, faux positifs sévères = 0, invention
≤ 10 %, détection ≥ 80 %.

## Lire les chiffres avec prudence

- **Petit échantillon.** Avec 25 conversations saines, « 0 faux positif » veut seulement dire que le
  taux réel est probablement inférieur à ~13 % (intervalle de confiance affiché). Pour une
  garantie plus fine, il faut 100 conversations saines ou plus.
- **Les cas suspects sont écrits d'après les règles.** Une détection de 100 % dessus ne dit rien
  sur le monde réel : de vraies arnaques seront formulées autrement.
- **Les captures sont des maquettes fictives** (`evals/images/generer.mjs`, application inventée).
  Elles testent la discipline de l'IA (donnée absente → `null`, auteur indiscernable → `inconnu`),
  pas la robustesse face à la vraie interface de Vinted ou Leboncoin.
- Avec `--repeat`, les répétitions d'un même cas ne sont pas des échantillons indépendants :
  l'intervalle de confiance est alors optimiste.

## Ajouter de vrais cas (le plus utile)

Ajouter des conversations **réelles et anonymisées** (prénoms, pseudos, numéros, adresses retirés)
dans `dataset/textes-sains.ts` ou `dataset/textes-suspects.ts`, ou des captures dans `images/` avec
leur entrée dans `dataset/images.ts`. Les conversations saines qui _ressemblent_ à des arnaques
(groupe `piege`) sont les plus précieuses : c'est là que se cachent les faux positifs.

Les rapports détaillés sont écrits dans `evals/rapports/` (ignoré par git : ils peuvent contenir les
conversations du jeu). Un test (`pnpm test`) fait aussi tourner les règles seules sur le jeu de
textes, ce qui sert de non-régression en CI.
