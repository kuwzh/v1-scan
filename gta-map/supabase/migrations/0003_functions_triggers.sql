create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger trg_markers_upd  before update on public.markers  for each row execute function public.set_updated_at();
create trigger trg_missions_upd before update on public.missions for each row execute function public.set_updated_at();
create trigger trg_vehicles_upd before update on public.vehicles for each row execute function public.set_updated_at();
create trigger trg_guides_upd   before update on public.guides   for each row execute function public.set_updated_at();

-- Anti-spam : force status=pending, hash l'IP, max 5 propositions / heure / IP.
create or replace function public.submissions_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare hdrs json; ip text; recent int;
begin
  if not public.is_admin() then
    begin hdrs := nullif(current_setting('request.headers', true), '')::json;
    exception when others then hdrs := null; end;
    ip := coalesce(nullif(trim(split_part(hdrs->>'x-forwarded-for', ',', 1)), ''), 'unknown');
    new.ip_hash     := encode(digest(ip, 'sha256'), 'hex');
    new.status      := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    select count(*) into recent from public.submissions
      where ip_hash = new.ip_hash and created_at > now() - interval '1 hour';
    if recent >= 5 then
      raise exception 'rate_limit_exceeded' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger trg_submissions_guard before insert on public.submissions
  for each row execute function public.submissions_guard();
