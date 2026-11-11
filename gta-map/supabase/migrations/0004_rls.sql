alter table public.admin_users   enable row level security;
alter table public.categories    enable row level security;
alter table public.markers       enable row level security;
alter table public.missions      enable row level security;
alter table public.vehicles      enable row level security;
alter table public.guides        enable row level security;
alter table public.submissions   enable row level security;
alter table public.user_progress enable row level security;

create policy categories_read  on public.categories for select using (true);
create policy categories_admin on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy markers_read  on public.markers for select using (status = 'published' or public.is_admin());
create policy markers_admin on public.markers for all using (public.is_admin()) with check (public.is_admin());

create policy missions_read  on public.missions for select using (status = 'published' or public.is_admin());
create policy missions_admin on public.missions for all using (public.is_admin()) with check (public.is_admin());

create policy vehicles_read  on public.vehicles for select using (status = 'published' or public.is_admin());
create policy vehicles_admin on public.vehicles for all using (public.is_admin()) with check (public.is_admin());

create policy guides_read  on public.guides for select
  using ((published_at is not null and published_at <= now()) or public.is_admin());
create policy guides_admin on public.guides for all using (public.is_admin()) with check (public.is_admin());

create policy submissions_insert on public.submissions for insert
  to anon, authenticated with check (status = 'pending');
create policy submissions_admin  on public.submissions for all
  using (public.is_admin()) with check (public.is_admin());

create policy progress_own on public.user_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
