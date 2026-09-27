-- REVIEW-ONLY / PRODUCTION READ-ONLY PREFLIGHT.
-- Source manifest: canonical-only-payment-transition-candidate.sql SHA-256
-- 2fca63f5ffb980562a872ccaf63d07492b527dec2e1dd3e0801d3baa23c56707
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
), audit_manifest(audit_id,restaurant_id,order_id,payment_id,actor_role,action,entity_type,created_at,before_data_md5,after_data_md5) as (
  values
   ('503dbaac-0d2b-4f77-89ca-3f1e448fe1a9'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'19d90015-bcae-48a3-acfb-2241d1adbbc0'::uuid,'4d964e9a-d45c-4917-8615-ccdd5240f460'::uuid,'owner','payment_added','payment','2026-07-30 10:11:25.22159+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','436aebc212a7b471cfb859da93ad2927'),
   ('af640062-126f-4cc8-8533-db85012c3826'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,'84531173-eb91-454e-a323-b48880fc9d13'::uuid,'owner','payment_added','payment','2026-07-30 10:15:01.333297+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','8273d4a96bd966ebce455c44988208dd'),
   ('857d2f7b-154a-4c2c-8418-8c40d026a72f'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,'e8bfda76-59d9-4a6b-b687-68f77533bca0'::uuid,'owner','payment_added','payment','2026-07-30 10:15:12.709661+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','87312d12f714ee32d358820375166696'),
   ('2ac9af5d-37d3-4d96-8c3d-3f6b4b3e0c4e'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'d2525eee-951e-4ee5-b17f-336f8fa5d079'::uuid,'bb2a1297-ce17-462d-8a3f-9a6e0c0fd3e0'::uuid,'owner','payment_added','payment','2026-07-30 10:15:57.029617+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','ffca783771bd823853477c1584f29778'),
   ('a6094ae2-c9a4-49f2-b3f2-236a32a18750'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'9238af74-f820-440d-8fc6-b36784343290'::uuid,'784dd6da-2581-490d-9fe4-f0e8a294cc81'::uuid,'owner','payment_added','payment','2026-07-30 12:25:26.844982+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','1f7b6ee69f885156f3dcccb552a7f2f4'),
   ('db45f903-ef82-4888-b1c1-3c11ef4444c8'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'837b6fb4-33b9-4df2-aaf0-e28f2e590219'::uuid,'7ca06b1f-4b27-467d-96a9-1580517383f2'::uuid,'owner','payment_added','payment','2026-07-30 12:55:10.356242+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','914426cdb38e6dfe57df19accc8a0749'),
   ('b13b661f-2c37-4fc8-860b-7d027b7766e1'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'ad3b16a6-57b6-48ff-b20d-c341bea57094'::uuid,'8719765b-9b68-45b3-8d88-1a68e86b3988'::uuid,'owner','payment_added','payment','2026-07-30 13:17:59.850863+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','70a1877d4db68f1c470b1f3e0a5046d9'),
   ('8d3f5d3e-d812-4047-ba8f-1d4de00fa236'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'c7b7cd99-39af-4109-8b39-944e2a4cfb08'::uuid,'b1c58a21-d2a0-4cbf-8135-139ee8235468'::uuid,'owner','payment_added','payment','2026-07-30 13:19:09.730857+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','b7aedea52d8d1e12a4951017ea3437b6'),
   ('fed926c9-77e4-49c8-bcaa-8fcb128b8488'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'ff0042d9-3a9d-4884-ba5d-ce3eb81df476'::uuid,'ce4497e4-ec91-4408-a6b8-13ac0ab4b39b'::uuid,'owner','payment_added','payment','2026-07-30 13:28:19.118706+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','dea3756cd3aaa6bf0aab53b611d72237'),
   ('6a8bc5bd-d1fa-4624-a224-55dfe552b1f6'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'cb16615e-a17a-4621-b55c-fcf217ec4b67'::uuid,'bc6d7226-41bf-4f34-9eca-99d5560fed01'::uuid,'owner','payment_added','payment','2026-07-30 23:21:59.562317+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','325cb04b7398aaece6cd554015bb0cce'),
   ('f45850c5-add5-434b-af38-b045a1f06ad0'::uuid,'246ebdf9-1ac2-4211-84ff-9b5163608374'::uuid,'e29ece3b-3b5a-4b63-8e6c-ed3ac763bdbd'::uuid,'fb67144a-a8be-4f3c-b4a8-86b077a59250'::uuid,'owner','payment_added','payment','2026-08-01 03:41:51.822193+00'::timestamptz,'99914b932bd37a50b983c5e7c90ae93b','42250bb759e65b14028a9e8d5bacb539')
), payment_match as (
  select count(*) as n from public.payments p join payment_manifest m on m.payment_id=p.id
  where p.restaurant_id=m.restaurant_id and p.order_id=m.order_id and p.split_bill_id is null
), order_projection_drift as (
  select count(*) as n from public.orders o join order_manifest m on m.order_id=o.id
  where o.restaurant_id is distinct from m.restaurant_id or o.status is distinct from m.status
     or o.payment_status is distinct from m.payment_status or o.paid_at is distinct from m.paid_at
     or o.closed_at is distinct from m.closed_at or o.payment_method is distinct from m.payment_method
     or round(o.total*100)::integer is distinct from m.total_cents
), order_total_drift as (
  select count(*) as n from (
    select m.order_id from order_manifest m left join public.payments p on p.order_id=m.order_id and p.id in(select payment_id from payment_manifest)
    group by m.order_id,m.payment_count having count(p.id)<>m.payment_count
  ) q
), unrelated as (
  select count(*) as n,coalesce(sum(p.amount_cents),0) as cents,
    md5(coalesce(string_agg(to_jsonb(p)::text,'|' order by p.id),'')) as fingerprint
  from public.payments p left join payment_manifest m on m.payment_id=p.id where m.payment_id is null
), audit_match as (
  select count(*) as n from public.order_audit_log a join audit_manifest m on m.audit_id=a.id
  where a.restaurant_id=m.restaurant_id and a.order_id=m.order_id and a.payment_id=m.payment_id
    and a.action=m.action and a.entity_type=m.entity_type
), audit_payment_mapping_drift as (
  select count(*) as n from (
    select m.payment_id from audit_manifest m left join public.order_audit_log a on a.payment_id=m.payment_id
    group by m.payment_id having count(a.id)<>1
  ) q
), extra_audits_for_approved_payments as (
  select count(*) as n from public.order_audit_log a join payment_manifest p on p.payment_id=a.payment_id
  left join audit_manifest m on m.audit_id=a.id where m.audit_id is null
), unrelated_audit as (
  select count(*) as n,md5(coalesce(string_agg(to_jsonb(a)::text,'|' order by a.id),'')) as fingerprint
  from public.order_audit_log a left join audit_manifest m on m.audit_id=a.id where m.audit_id is null
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
  'expected_approved_audits',(select count(*) from audit_manifest),
  'matched_approved_audits',(select n from audit_match),
  'audit_payment_mapping_drift',(select n from audit_payment_mapping_drift),
  'extra_audits_for_approved_payments',(select n from extra_audits_for_approved_payments),
  'unrelated_audit_count',(select n from unrelated_audit),
  'unrelated_audit_fingerprint',(select fingerprint from unrelated_audit),
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
