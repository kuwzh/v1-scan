-- DONNÉES PLACEHOLDER : exemples fictifs, tout est en brouillon. Texte rédigé en propre.
-- Les coordonnées sont normalisées (0..1) et ne correspondent à aucun lieu réel du jeu.
insert into public.categories (slug, name, icon, color, group_type, sort_order) values
  ('missions-principales',  'Missions principales',  'flag',      '#FF2E88', 'missions',     10),
  ('missions-secondaires',  'Missions secondaires',  'flag-triangle-right', '#FF8A00', 'missions', 20),
  ('cachettes',             'Cachettes',             'package',   '#00E5FF', 'collectibles', 30),
  ('objets-rares',          'Objets rares',          'gem',       '#7B2FF7', 'collectibles', 40),
  ('voitures',              'Voitures',              'car',       '#FF8A00', 'vehicules',    50),
  ('motos',                 'Motos',                 'bike',      '#FF2E88', 'vehicules',    60),
  ('bateaux',               'Bateaux',               'ship',      '#00E5FF', 'vehicules',    70),
  ('points-d-interet',      'Points d''intérêt',     'map-pin',   '#7B2FF7', 'lieux',        80),
  ('activites',             'Activités',             'dices',     '#FF8A00', 'activites',    90);

insert into public.markers (slug, title, description, category_id, x, y, region, source_credit, status)
select v.slug, v.title, v.description, c.id, v.x, v.y, v.region, 'Placeholder', 'draft'
from (values
  ('placeholder-cachette-1', '[PLACEHOLDER] Cachette de test',  'Marqueur d''exemple, à remplacer par un vrai emplacement.', 'cachettes', 0.32, 0.41, 'Région fictive A'),
  ('placeholder-objet-1',    '[PLACEHOLDER] Objet rare de test','Marqueur d''exemple pour tester les compteurs.',          'objets-rares', 0.55, 0.62, 'Région fictive B'),
  ('placeholder-lieu-1',     '[PLACEHOLDER] Lieu de test',      'Point d''intérêt fictif pour tester la page détail.',      'points-d-interet', 0.70, 0.30, 'Région fictive C'),
  ('placeholder-mission-1',  '[PLACEHOLDER] Départ de mission', 'Point de départ fictif d''une mission d''exemple.',        'missions-principales', 0.45, 0.50, 'Région fictive A')
) as v(slug, title, description, cat, x, y, region)
join public.categories c on c.slug = v.cat;

insert into public.missions (slug, title, character, chapter, order_index, summary, walkthrough, marker_id, status)
select 'placeholder-mission-1', '[PLACEHOLDER] Mission d''exemple', 'lucia', 1, 1,
  'Résumé fictif servant à tester la mise en page.',
  E'## Étapes\n\n1. Rejoindre le point de départ.\n2. Suivre l''objectif affiché.\n\n*Contenu placeholder.*',
  m.id, 'draft'
from public.markers m where m.slug = 'placeholder-mission-1';

insert into public.vehicles (slug, name, type, rarity, how_to_get, status) values
  ('placeholder-vehicule-1', '[PLACEHOLDER] Voiture de test', 'voiture', 'commun', 'Information fictive.', 'draft'),
  ('placeholder-vehicule-2', '[PLACEHOLDER] Moto de test',    'moto',    'rare',   'Information fictive.', 'draft');

insert into public.guides (slug, title, excerpt, content, category, published_at) values
  ('placeholder-guide-1', '[PLACEHOLDER] Guide de démarrage', 'Article d''exemple pour tester le rendu.',
   E'# Guide de démarrage\n\nTexte fictif rédigé en propre. À remplacer.', 'debuter', null);
