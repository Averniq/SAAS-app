-- This verifier is deliberately data-driven: the builder stores only the SHA-verified C3 capture.
DO $$
DECLARE
  contract jsonb;
  expected jsonb;
  actual_hash text;
  relation jsonb;
  actual_acl text;
BEGIN
  SELECT payload INTO contract FROM p0_deploy_01_fixture.contract;
  IF contract IS NULL THEN RAISE EXCEPTION 'missing generated, SHA-verified fixture contract'; END IF;
  FOR expected IN SELECT value FROM jsonb_array_elements(contract->'category_a_functions')
  LOOP
    SELECT encode(digest(pg_get_functiondef((CASE WHEN (expected->>'identity') LIKE (expected->>'schema') || '.%' THEN expected->>'identity' ELSE format('%I.%s', expected->>'schema', expected->>'identity') END)::regprocedure), 'sha256'), 'hex') INTO actual_hash;
    IF actual_hash IS DISTINCT FROM expected->>'definition_sha256' THEN RAISE EXCEPTION 'function hash mismatch: %.%', expected->>'schema', expected->>'identity'; END IF;
  END LOOP;
  FOR expected IN SELECT value FROM jsonb_array_elements(contract->'execution_required_trigger_dependency_functions')
  LOOP
    SELECT encode(digest(pg_get_functiondef((CASE WHEN (expected->>'identity') LIKE (expected->>'schema') || '.%' THEN expected->>'identity' ELSE format('%I.%s', expected->>'schema', expected->>'identity') END)::regprocedure), 'sha256'), 'hex') INTO actual_hash;
    IF actual_hash IS DISTINCT FROM expected->>'definition_sha256' THEN RAISE EXCEPTION 'trigger dependency hash mismatch: %.%', expected->>'schema', expected->>'identity'; END IF;
  END LOOP;
  IF encode(digest(pg_get_functiondef('auth.uid()'::regprocedure), 'sha256'), 'hex') IS DISTINCT FROM contract->'completeness_validator'->>'auth_uid_definition_sha256' THEN RAISE EXCEPTION 'auth.uid() baseline hash mismatch'; END IF;
  IF EXISTS (SELECT 1 FROM public.public_order_tokens) THEN RAISE EXCEPTION 'public_order_tokens approved prestate must be empty'; END IF;
  FOR relation IN SELECT value FROM jsonb_array_elements(contract->'category_a_relations')
  LOOP
    SELECT coalesce(c.relacl::text, '') INTO actual_acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=relation->>'schema' AND c.relname=relation->>'name';
    IF actual_acl IS DISTINCT FROM relation->>'relation_acl' THEN RAISE EXCEPTION 'relation ACL mismatch: %.%', relation->>'schema', relation->>'name'; END IF;
    IF position('m' IN relation->>'relation_acl') > 0 AND position('m' IN actual_acl) = 0 THEN RAISE EXCEPTION 'MAINTAIN privilege missing: %.%', relation->>'schema', relation->>'name'; END IF;
  END LOOP;
END $$;
