create extension if not exists pgcrypto with schema extensions;

create type public.category_group    as enum ('missions','collectibles','vehicules','lieux','activites');
create type public.publish_status    as enum ('draft','published');
create type public.submission_status as enum ('pending','approved','rejected');
create type public.mission_character as enum ('lucia','jason','both');
