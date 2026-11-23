alter table public.learner_profiles
  add column if not exists gender text check (gender in ('male', 'female')),
  add column if not exists graduation_year integer check (graduation_year between 1950 and 2100);

-- Keep completed onboarding durable and validate the first self-signup completion.
create function public.validate_learner_profile_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.profile_completed then
      new.profile_completed := true;
      return new;
    end if;
  end if;

  if new.profile_completed and new.institution_id is null then
    if nullif(btrim(new.contact_number), '') is null
      or nullif(btrim(split_part(new.city_country, ',', 1)), '') is null
      or nullif(btrim(split_part(new.city_country, ',', 2)), '') is null
      or nullif(btrim(new.institution_name), '') is null
      or nullif(btrim(new.program), '') is null
      or new.graduation_year is null
      or not exists (select 1 from public.github_connections_public where user_id = new.user_id)
    then
      raise exception 'Complete the required profile fields and connect GitHub before submitting.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_learner_profile_completion
before insert or update of profile_completed on public.learner_profiles
for each row execute function public.validate_learner_profile_completion();
