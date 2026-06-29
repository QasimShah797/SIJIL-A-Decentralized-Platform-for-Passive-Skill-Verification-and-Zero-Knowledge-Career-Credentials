-- Manual apply: self-signup learner profile columns (same as migration 20260701120000)

ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS graduation_year integer;

UPDATE public.learner_profiles
SET
  city = coalesce(nullif(trim(city), ''), nullif(trim(split_part(city_country, ',', 1)), '')),
  country = coalesce(
    nullif(trim(country), ''),
    nullif(trim(substring(city_country from position(',' in city_country) + 1)), '')
  )
WHERE city_country IS NOT NULL
  AND trim(city_country) <> ''
  AND (city IS NULL OR trim(city) = '' OR country IS NULL OR trim(country) = '');
