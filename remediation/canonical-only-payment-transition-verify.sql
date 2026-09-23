-- REVIEW-ONLY / POST-COMMIT READ-ONLY VERIFICATION.
-- Source manifest: canonical-only-payment-transition-candidate.sql SHA-256
-- 1485925dd32f002bac18582c5847dd14dbae00fb98f3014212a45a073253ea8a
-- Run in a dedicated read-only session. This file contains no DDL or DML.
begin read only;

-- The manifest is intentionally duplicated verbatim from the transition candidate.
with payment_manifest(payment_id,restaurant_id,order_id,amount_cents,payment_method,status,note,idempotency_key,payment_reference,paid_at) as (values
 ('4d964e9a-d45c-4917-8615-ccdd5240f460'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'19d90015-bcae-48a3-acfb-2241d1adbbc0'::uuid,2550,'Card','completed','Table balance','15df8cbf-5a0c-4b99-9b6f-1c9f97060e4e'::uuid,null::text,'2026-07-30 10:11:25.22159+00'::timestamptz),
 ('84531173-eb91-454e-a323-b48880fc9d13'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,200,'Card','completed','Bill 1','d7474db0-9e93-4eda-9605-2b7357efe1bb'::uuid,null::text,'2026-07-30 10:15:01.333297+00'::timestamptz),
 ('e8bfda76-59d9-4a6b-b687-68f77533bca0'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,100,'Card','completed','Bill 1','4cca26e6-08d1-4c40-b6b1-02f94ca40682'::uuid,null::text,'2026-07-30 10:15:12.709661+00'::timestamptz),
 ('bb2a1297-ce17-462d-8a3f-9a6e0c0fd3e0'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,100,'Card','completed','Table balance','f973bf49-47fa-49ee-8758-d02906310d5c'::uuid,null::text,'2026-07-30 10:15:57.029617+00'::timestamptz),
 ('784dd6da-2581-490d-9fe4-f0e8a294cc81'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'9238af74-f820-440d-8fc6-b36784343290'::uuid,4150,'Card','completed','Table balance','e72f4584-ee39-4810-bae7-0fd381de3af9'::uuid,null::text,'2026-07-30 12:25:26.844982+00'::timestamptz),
 ('7ca06b1f-4b27-467d-96a9-1580517383f2'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'837b6fb4-33b9-4df2-aaf0-e28f2e590219'::uuid,13300,'Card','completed','Table balance','98db0257-cea2-4587-afcf-48cad65d7e7e'::uuid,null::text,'2026-07-30 12:55:10.356242+00'::timestamptz),
 ('8719765b-9b68-45b3-8d88-1a68e86b3988'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'ad3b16a6-57b6-48ff-b20d-c341bea57094'::uuid,6200,'Card','completed','Table balance','ff5ae846-1097-450c-9894-baf9ea6ee25c'::uuid,null::text,'2026-07-30 13:17:59.850863+00'::timestamptz),
 ('b1c58a21-d2a0-4cbf-8135-139ee8235468'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'c7b7cd99-39af-4109-8b39-944e2a4cfb08'::uuid,7550,'Card','completed','Table balance','1d983d86-a3d8-4a98-890c-ef8aae541bfa'::uuid,null::text,'2026-07-30 13:19:09.730857+00'::timestamptz),
 ('ce4497e4-ec91-4408-a6b8-13ac0ab4b39b'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'ff0042d9-3a9d-4884-ba5d-ce3eb81df476'::uuid,2850,'Card','completed','Table balance','317df334-5468-42a7-bdcc-edc8d6bdc206'::uuid,null::text,'2026-07-30 13:28:19.118706+00'::timestamptz),
 ('bc6d7226-41bf-4f34-9eca-99d5560fed01'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'cb16615e-a17a-4621-b55c-fcf217ec4b67'::uuid,3750,'Card','completed','Table balance','9d2f82b1-f853-4eb9-bc35-e5bcd9e4acb7'::uuid,null::text,'2026-07-30 23:21:59.562317+00'::timestamptz),
 ('fb67144a-a8be-4f3c-b4a8-86b077a59250'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'e29ece3b-3b5a-4b63-8e6c-ed3ac763bdbd'::uuid,8400,'Cash','completed','Table balance','835d8cdb-23f5-40e5-a6b6-bd1ffcfdec18'::uuid,null::text,'2026-08-01 03:41:51.822193+00'::timestamptz)
), order_manifest(order_id,restaurant_id,status,payment_status,paid_at,closed_at,payment_method,total_cents,payment_count,payment_cents) as (values
 ('19d90015-bcae-48a3-acfb-2241d1adbbc0'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 10:11:25.22159+00'::timestamptz,'2026-07-30 10:11:25.22159+00'::timestamptz,'Card',2550,1,2550),
 ('d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 10:15:57.029617+00'::timestamptz,'2026-07-30 10:15:57.029617+00'::timestamptz,'Card',400,3,400),
 ('9238af74-f820-440d-8fc6-b36784343290'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 12:25:26.844982+00'::timestamptz,'2026-07-30 12:25:26.844982+00'::timestamptz,'Card',4150,1,4150),
 ('837b6fb4-33b9-4df2-aaf0-e28f2e590219'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 12:55:10.356242+00'::timestamptz,'2026-07-30 12:55:10.356242+00'::timestamptz,'Card',13300,1,13300),
 ('ad3b16a6-57b6-48ff-b20d-c341bea57094'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 13:17:59.850863+00'::timestamptz,'2026-07-30 13:17:59.850863+00'::timestamptz,'Card',6200,1,6200),
 ('c7b7cd99-39af-4109-8b39-944e2a4cfb08'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 13:19:09.730857+00'::timestamptz,'2026-07-30 13:19:09.730857+00'::timestamptz,'Card',7550,1,7550),
 ('ff0042d9-3a9d-4884-ba5d-ce3eb81df476'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 13:28:19.118706+00'::timestamptz,'2026-07-30 13:28:19.118706+00'::timestamptz,'Card',2850,1,2850),
 ('cb16615e-a17a-4621-b55c-fcf217ec4b67'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 23:21:59.562317+00'::timestamptz,'2026-07-30 23:21:59.562317+00'::timestamptz,'Card',3750,1,3750),
 ('e29ece3b-3b5a-4b63-8e6c-ed3ac763bdbd'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-08-01 03:41:51.822193+00'::timestamptz,'2026-08-01 03:41:51.822193+00'::timestamptz,'Cash',8400,1,8400)
), unrelated as (
  select count(*) as n,coalesce(sum(p.amount_cents),0) as cents,
    md5(coalesce(string_agg(to_jsonb(p)::text,'|' order by p.id),'')) as fingerprint
  from public.payments p left join payment_manifest m on m.payment_id=p.id where m.payment_id is null
)
select jsonb_build_object(
  'remaining_approved_payments',(select count(*) from public.payments p join payment_manifest m on m.payment_id=p.id),
  'cleaned_order_projections',(select count(*) from public.orders o join order_manifest m on m.order_id=o.id where o.payment_status='unpaid' and o.paid_at is null and o.payment_method is null and o.closed_at is null),
  'status_drift',(select count(*) from public.orders o join order_manifest m on m.order_id=o.id where o.status is distinct from m.status),
  'linked_splits',(select count(*) from public.split_bills s join order_manifest m on m.order_id=s.order_id),
  'unrelated_payment_count',(select n from unrelated),
  'unrelated_payment_cents',(select cents from unrelated),
  'unrelated_payment_fingerprint',(select fingerprint from unrelated),
  'payment_operations_exists',to_regclass('public.payment_operations') is not null,
  'payment_operations_count',(select count(*) from public.payment_operations),
  'payment_operations_rls',(select relrowsecurity from pg_class where oid='public.payment_operations'::regclass),
  'rpc_acl',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('public',has_function_privilege('public',p.oid,'execute'),'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'))) from pg_proc p where p.oid in (
    'public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)'::regprocedure,
    'public.list_authoritative_payment_operations(uuid,uuid)'::regprocedure,
    'public.record_restaurant_order_payment(uuid,uuid,text)'::regprocedure,
    'public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)'::regprocedure,
    'public.void_restaurant_payment(uuid,uuid,text)'::regprocedure
  ))
) as verification;

commit;
