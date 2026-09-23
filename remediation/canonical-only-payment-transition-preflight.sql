-- REVIEW-ONLY / PRODUCTION READ-ONLY PREFLIGHT.
-- Source manifest: canonical-only-payment-transition-candidate.sql SHA-256
-- 1485925dd32f002bac18582c5847dd14dbae00fb98f3014212a45a073253ea8a
-- Run in a dedicated read-only session. This file contains no DDL or DML.
begin read only;

with payment_manifest(payment_id,restaurant_id,order_id,amount_cents,payment_method,status,note,idempotency_key,payment_reference,paid_at) as (
  values
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
), order_manifest(order_id,restaurant_id,status,payment_status,paid_at,closed_at,payment_method,total_cents,payment_count,payment_cents) as (
  values
   ('19d90015-bcae-48a3-acfb-2241d1adbbc0'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 10:11:25.22159+00'::timestamptz,'2026-07-30 10:11:25.22159+00'::timestamptz,'Card',2550,1,2550),
   ('d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 10:15:57.029617+00'::timestamptz,'2026-07-30 10:15:57.029617+00'::timestamptz,'Card',400,3,400),
   ('9238af74-f820-440d-8fc6-b36784343290'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 12:25:26.844982+00'::timestamptz,'2026-07-30 12:25:26.844982+00'::timestamptz,'Card',4150,1,4150),
   ('837b6fb4-33b9-4df2-aaf0-e28f2e590219'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 12:55:10.356242+00'::timestamptz,'2026-07-30 12:55:10.356242+00'::timestamptz,'Card',13300,1,13300),
   ('ad3b16a6-57b6-48ff-b20d-c341bea57094'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 13:17:59.850863+00'::timestamptz,'2026-07-30 13:17:59.850863+00'::timestamptz,'Card',6200,1,6200),
   ('c7b7cd99-39af-4109-8b39-944e2a4cfb08'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 13:19:09.730857+00'::timestamptz,'2026-07-30 13:19:09.730857+00'::timestamptz,'Card',7550,1,7550),
   ('ff0042d9-3a9d-4884-ba5d-ce3eb81df476'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 13:28:19.118706+00'::timestamptz,'2026-07-30 13:28:19.118706+00'::timestamptz,'Card',2850,1,2850),
   ('cb16615e-a17a-4621-b55c-fcf217ec4b67'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-07-30 23:21:59.562317+00'::timestamptz,'2026-07-30 23:21:59.562317+00'::timestamptz,'Card',3750,1,3750),
   ('e29ece3b-3b5a-4b63-8e6c-ed3ac763bdbd'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'completed','paid','2026-08-01 03:41:51.822193+00'::timestamptz,'2026-08-01 03:41:51.822193+00'::timestamptz,'Cash',8400,1,8400)
), payment_match as (
  select count(*) as n from public.payments p join payment_manifest m on m.payment_id=p.id
  where p.restaurant_id=m.restaurant_id and p.order_id=m.order_id and p.amount_cents=m.amount_cents
    and p.status=m.status and p.payment_method=m.payment_method and p.split_bill_id is null
    and p.idempotency_key=m.idempotency_key and p.note is not distinct from m.note
    and p.payment_reference is not distinct from m.payment_reference and p.paid_at=m.paid_at
), order_projection_drift as (
  select count(*) as n from public.orders o join order_manifest m on m.order_id=o.id
  where o.restaurant_id is distinct from m.restaurant_id or o.status is distinct from m.status
     or o.payment_status is distinct from m.payment_status or o.paid_at is distinct from m.paid_at
     or o.closed_at is distinct from m.closed_at or o.payment_method is distinct from m.payment_method
     or round(o.total*100)::integer is distinct from m.total_cents
), order_total_drift as (
  select count(*) as n from (
    select m.order_id from order_manifest m join public.payments p on p.order_id=m.order_id and p.status='completed'
    group by m.order_id,m.payment_count,m.payment_cents having count(*)<>m.payment_count or sum(p.amount_cents)<>m.payment_cents
  ) q
), unrelated as (
  select count(*) as n,coalesce(sum(p.amount_cents),0) as cents,
    md5(coalesce(string_agg(to_jsonb(p)::text,'|' order by p.id),'')) as fingerprint
  from public.payments p left join payment_manifest m on m.payment_id=p.id where m.payment_id is null
)
select jsonb_build_object(
  'expected_payments',(select count(*) from payment_manifest),
  'matched_payments',(select n from payment_match),
  'expected_orders',(select count(*) from order_manifest),
  'matched_orders',(select count(*) from public.orders o join order_manifest m on m.order_id=o.id),
  'order_projection_drift',(select n from order_projection_drift),
  'order_total_drift',(select n from order_total_drift),
  'unapproved_payments_on_manifest_orders',(select count(*) from public.payments p join order_manifest m on m.order_id=p.order_id where p.id not in(select payment_id from payment_manifest)),
  'linked_splits',(select count(*) from public.split_bills s join order_manifest m on m.order_id=s.order_id),
  'unrelated_payment_count',(select n from unrelated),
  'unrelated_payment_cents',(select cents from unrelated),
  'unrelated_payment_fingerprint',(select fingerprint from unrelated),
  'canonical_ledger_absent',to_regclass('public.payment_operations') is null,
  'canonical_writer_absent',to_regprocedure('public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)') is null,
  'canonical_list_absent',to_regprocedure('public.list_authoritative_payment_operations(uuid,uuid)') is null,
  'legacy_order_writer_present',to_regprocedure('public.record_restaurant_order_payment(uuid,uuid,text)') is not null,
  'legacy_detailed_writer_present',to_regprocedure('public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)') is not null,
  'legacy_void_present',to_regprocedure('public.void_restaurant_payment(uuid,uuid,text)') is not null,
  'legacy_authenticated_execute',jsonb_build_object(
    'record_restaurant_order_payment',has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute'),
    'record_restaurant_payment',has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute'),
    'void_restaurant_payment',has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute')
  )
) as preflight;

commit;
