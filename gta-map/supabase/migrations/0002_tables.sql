-- Admins : insert into public.admin_users select id from auth.users where email = '...';
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  icon        text,
  color       text not null default '#FF2E88' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  group_type  public.category_group not null,
  sort_order  int not null default 0
);

-- x, y : coordonnées normalisées (0..1) ; y = 0 en haut de la carte.
create table public.markers (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  description   text,
  category_id   uuid not null references public.categories(id) on delete restrict,
  x             double precision not null check (x between 0 and 1),
  y             double precision not null check (y between 0 and 1),
  region        text,
  image_url     text,
  youtube_url   text check (youtube_url is null or youtube_url ~ '^https://(www\.)?(youtube\.com|youtu\.be)/'),
  source_credit text,
  status        public.publish_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (
                  to_tsvector('french'::regconfig,
                    coalesce(title,'') || ' ' || coalesce(region,'') || ' ' || coalesce(description,''))
                ) stored
);
create index markers_category_idx on public.markers(category_id);
create index markers_status_idx   on public.markers(status);
create index markers_search_idx   on public.markers using gin(search);

create table public.missions (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  title         text not null,
  character     public.mission_character not null,
  chapter       int,
  order_index   int not null default 0,
  summary       text,
  walkthrough   text,
  rewards       text,
  marker_id     uuid references public.markers(id) on delete set null,
  youtube_url   text,
  source_credit text,
  status        public.publish_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index missions_order_idx on public.missions(character, order_index);

create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  type        text not null,
  rarity      text,
  top_speed   int,
  price       numeric(12,2),
  how_to_get  text,
  marker_id   uuid references public.markers(id) on delete set null,
  image_url   text,
  status      public.publish_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.guides (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  excerpt         text,
  content         text,
  category        text,
  seo_title       text,
  seo_description text check (seo_description is null or char_length(seo_description) <= 200),
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.submissions (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('new_marker','correction','other')),
  payload         jsonb not null check (pg_column_size(payload) < 8192),
  x               double precision check (x between 0 and 1),
  y               double precision check (y between 0 and 1),
  submitter_email text check (submitter_email is null or submitter_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status          public.submission_status not null default 'pending',
  ip_hash         text,
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index submissions_status_idx on public.submissions(status, created_at desc);
create index submissions_rate_idx   on public.submissions(ip_hash, created_at);

create table public.user_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  marker_id    uuid not null references public.markers(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, marker_id)
);
