-- Real Postgres checks for assessment commitment privileges and triggers.
-- Expected denials are caught. An unexpected success raises TEST FAILED.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mcq_task_attempts'
      AND column_name IN ('institution_attestation_request_id', 'sent_to_institution_at')
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: migration required institutional attestation columns';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mcq_task_attempts
    WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      AND competency_name = 'Legacy skill'
      AND status = 'completed'
      AND answer_key = '{"sealed":true}'::jsonb
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: existing assessment was not preserved';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.credentials
    WHERE id = '99999999-9999-4999-8999-999999999999'
      AND credential_hash = 'legacy-hash'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: existing credential was not preserved';
  END IF;
END $$;

INSERT INTO auth.users (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('11111111-1111-4111-8111-111111111111', 'learner'),
  ('22222222-2222-4222-8222-222222222222', 'learner'),
  ('33333333-3333-4333-8333-333333333333', 'recruiter');

INSERT INTO public.mcq_task_attempts (
  id, learner_user_id, competency_name, questions, answer_key
) VALUES
  (
    '44444444-4444-4444-8444-444444444444',
    '11111111-1111-4111-8111-111111111111',
    'Circuits',
    '[{"id":"q1"}]'::jsonb,
    '[{"id":"q1","correctOptionId":"A"}]'::jsonb
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    'Circuits',
    '[{"id":"q1"}]'::jsonb,
    '[{"id":"q1","correctOptionId":"B"}]'::jsonb
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '22222222-2222-4222-8222-222222222222',
    'Circuits',
    '[{"id":"q1"}]'::jsonb,
    '[{"id":"q1","correctOptionId":"C"}]'::jsonb
  );

SELECT public.finalize_mcq_attempt(
  '44444444-4444-4444-8444-444444444444',
  '11111111-1111-4111-8111-111111111111',
  '{"q1":"A"}'::jsonb,
  73, 100, 73, true,
  'MCQ passed with 73%.',
  timestamptz '2026-10-17 00:00:00+00',
  '4507768595048672970581706270570294537909576572913353501816464357845450185450',
  'poseidon-bn254-v1',
  'score-threshold-v1',
  1,
  '42'
);

DO $$
DECLARE
  stored_score integer;
  stored_commitment text;
  stored_status text;
  stored_key jsonb;
BEGIN
  SELECT status, percentage::integer, commitment, answer_key
    INTO stored_status, stored_score, stored_commitment, stored_key
  FROM public.mcq_task_attempts
  WHERE id = '44444444-4444-4444-8444-444444444444';

  IF stored_status IS DISTINCT FROM 'completed'
     OR stored_score IS DISTINCT FROM 73
     OR stored_commitment IS DISTINCT FROM '4507768595048672970581706270570294537909576572913353501816464357845450185450'
     OR stored_key IS DISTINCT FROM '[{"id":"q1","correctOptionId":"A"}]'::jsonb
  THEN
    RAISE EXCEPTION 'TEST FAILED: service role did not finalize the trusted result';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.assessment_openings
    WHERE attempt_id = '44444444-4444-4444-8444-444444444444'
      AND learner_user_id = '11111111-1111-4111-8111-111111111111'
      AND score = 73
      AND blinding = '42'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: opening does not match the finalized score';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM public.finalize_mcq_attempt(
      '44444444-4444-4444-8444-444444444444',
      '11111111-1111-4111-8111-111111111111',
      '{"q1":"A"}'::jsonb,
      100, 100, 100, true,
      'changed',
      now(),
      '99',
      'poseidon-bn254-v1',
      'score-threshold-v1',
      1,
      '7'
    );
    RAISE EXCEPTION 'TEST FAILED: duplicate evaluation was accepted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%not awaiting evaluation%' THEN
        RAISE;
      END IF;
  END;
END $$;

DO $$
DECLARE
  still_in_progress boolean;
  opening_count integer;
BEGIN
  BEGIN
    PERFORM public.finalize_mcq_attempt(
      '55555555-5555-4555-8555-555555555555',
      '11111111-1111-4111-8111-111111111111',
      '{"q1":"A"}'::jsonb,
      7, 10, 73, true,
      'MCQ passed with 73%.',
      now(),
      '100',
      'poseidon-bn254-v1',
      'score-threshold-v1',
      1,
      ''
    );
    RAISE EXCEPTION 'TEST FAILED: invalid opening was stored';
  EXCEPTION
    WHEN check_violation OR raise_exception THEN
      IF SQLERRM LIKE 'TEST FAILED:%' THEN
        RAISE;
      END IF;
  END;

  SELECT status = 'in_progress' INTO still_in_progress
  FROM public.mcq_task_attempts
  WHERE id = '55555555-5555-4555-8555-555555555555';

  SELECT count(*) INTO opening_count
  FROM public.assessment_openings
  WHERE attempt_id = '55555555-5555-4555-8555-555555555555';

  IF still_in_progress IS NOT TRUE OR opening_count <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: partial finalize left a completed attempt';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    UPDATE public.mcq_task_attempts
    SET percentage = 100
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: completed score was modified';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.mcq_task_attempts
    SET answer_key = '[{"id":"q1","correctOptionId":"D"}]'::jsonb
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: completed answer key was modified';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.mcq_task_attempts
    SET commitment = '99'
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: completed commitment was modified';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    UPDATE public.mcq_task_attempts
    SET status = 'in_progress', percentage = NULL, commitment = NULL
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: completed attempt was reset';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%immutable%' THEN
        RAISE;
      END IF;
  END;

  BEGIN
    INSERT INTO public.mcq_task_attempts (
      id, learner_user_id, competency_name, questions, answer_key, status, percentage, commitment
    ) VALUES (
      '77777777-7777-4777-8777-777777777777',
      '11111111-1111-4111-8111-111111111111',
      'Circuits',
      '[]'::jsonb,
      '[]'::jsonb,
      'completed',
      100,
      '1'
    );
    RAISE EXCEPTION 'TEST FAILED: fabricated completed attempt was inserted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE '%created in progress%' THEN
        RAISE;
      END IF;
  END;
END $$;

SET ROLE service_role;

DO $$
BEGIN
  BEGIN
    UPDATE public.mcq_task_attempts
    SET percentage = 1
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: service role updated a finalized attempt directly';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SET ROLE authenticated;

DO $$
DECLARE
  visible_commitment text;
  other_openings integer;
BEGIN
  SELECT commitment INTO visible_commitment
  FROM public.mcq_task_attempts
  WHERE id = '44444444-4444-4444-8444-444444444444';
  IF visible_commitment IS DISTINCT FROM '4507768595048672970581706270570294537909576572913353501816464357845450185450' THEN
    RAISE EXCEPTION 'TEST FAILED: learner could not read the public commitment';
  END IF;

  BEGIN
    PERFORM answer_key FROM public.mcq_task_attempts
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: learner read the answer key';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    UPDATE public.mcq_task_attempts
    SET percentage = 100
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: learner modified the score';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    UPDATE public.mcq_task_attempts
    SET commitment = '1'
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: learner modified the commitment';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    UPDATE public.mcq_task_attempts
    SET answer_key = '[{"id":"q1","correctOptionId":"D"}]'::jsonb
    WHERE id = '44444444-4444-4444-8444-444444444444';
    RAISE EXCEPTION 'TEST FAILED: learner modified the answer key';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    INSERT INTO public.mcq_task_attempts (
      id, learner_user_id, competency_name, questions, answer_key, status
    ) VALUES (
      '88888888-8888-4888-8888-888888888888',
      '11111111-1111-4111-8111-111111111111',
      'Circuits',
      '[]'::jsonb,
      '[]'::jsonb,
      'completed'
    );
    RAISE EXCEPTION 'TEST FAILED: learner inserted a completed attempt';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  IF (
    SELECT blinding FROM public.assessment_openings
    WHERE attempt_id = '44444444-4444-4444-8444-444444444444'
  ) IS DISTINCT FROM '42' THEN
    RAISE EXCEPTION 'TEST FAILED: owning learner could not read the opening';
  END IF;

  SELECT count(*) INTO other_openings
  FROM public.assessment_openings
  WHERE learner_user_id = '22222222-2222-4222-8222-222222222222';
  IF other_openings <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: learner read another learner opening';
  END IF;

  IF (
    SELECT count(*) FROM public.mcq_task_attempts_learner
    WHERE learner_user_id <> '11111111-1111-4111-8111-111111111111'
  ) <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: learner view leaked another learner';
  END IF;
END $$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);

SET ROLE authenticated;

DO $$
DECLARE
  visible integer;
BEGIN
  SELECT count(*) INTO visible FROM public.assessment_openings;
  IF visible <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: recruiter read a private opening';
  END IF;

  BEGIN
    PERFORM public.finalize_mcq_attempt(
      '66666666-6666-4666-8666-666666666666',
      '22222222-2222-4222-8222-222222222222',
      '{}'::jsonb,
      1, 1, 100, true,
      'x', now(), '1', 'poseidon-bn254-v1', 'score-threshold-v1', 1, '1'
    );
    RAISE EXCEPTION 'TEST FAILED: recruiter finalized an attempt';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

RESET ROLE;

SET ROLE service_role;

SELECT public.finalize_mcq_attempt(
  '66666666-6666-4666-8666-666666666666',
  '22222222-2222-4222-8222-222222222222',
  '{"q1":"C"}'::jsonb,
  1, 1, 100, true,
  'MCQ passed with 100%.',
  now(),
  '100',
  'poseidon-bn254-v1',
  'score-threshold-v1',
  1,
  '9'
);

DO $$
DECLARE
  other_blinding text;
BEGIN
  SELECT blinding INTO other_blinding
  FROM public.assessment_openings
  WHERE attempt_id = '66666666-6666-4666-8666-666666666666';
  IF other_blinding IS DISTINCT FROM '9' THEN
    RAISE EXCEPTION 'TEST FAILED: service role could not finalize through the function';
  END IF;
END $$;

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SET ROLE authenticated;

DO $$
DECLARE
  leaked integer;
BEGIN
  SELECT count(*) INTO leaked
  FROM public.assessment_openings
  WHERE attempt_id = '66666666-6666-4666-8666-666666666666';
  IF leaked <> 0 THEN
    RAISE EXCEPTION 'TEST FAILED: learner read another learner opening';
  END IF;
END $$;

RESET ROLE;

DO $$
DECLARE
  options text[];
BEGIN
  SELECT reloptions INTO options
  FROM pg_class
  WHERE oid = 'public.mcq_task_attempts_learner'::regclass;
  IF NOT ('security_invoker=true' = ANY (options)) THEN
    RAISE EXCEPTION 'TEST FAILED: learner view is not security invoker';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'mcq_task_attempts_learner'
      AND column_name = 'answer_key'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: learner view exposes the answer key';
  END IF;
END $$;

RESET ROLE;
SET ROLE anon;

DO $$
BEGIN
  BEGIN
    PERFORM answer_key FROM public.mcq_task_attempts LIMIT 1;
    RAISE EXCEPTION 'TEST FAILED: anon read the answer key';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    PERFORM blinding FROM public.assessment_openings LIMIT 1;
    RAISE EXCEPTION 'TEST FAILED: anon read a private opening';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

RESET ROLE;

DELETE FROM public.mcq_task_attempts
WHERE id = '44444444-4444-4444-8444-444444444444';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.assessment_openings
    WHERE attempt_id = '44444444-4444-4444-8444-444444444444'
  ) THEN
    RAISE EXCEPTION 'TEST FAILED: deleting an attempt left its opening behind';
  END IF;
END $$;
