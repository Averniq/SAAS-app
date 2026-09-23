-- LOCAL-ONLY REVIEW CANDIDATE. One atomic canonical-only transition.
begin isolation level serializable;
-- Controlled payment freeze: prevents a concurrent payment/split/order mutation
-- from escaping the manifest preflight before the explicit cleanup completes.
lock table public.payments, public.orders, public.split_bills in share row exclusive mode;

create temp table approved_payment_manifest(
  payment_id uuid primary key, restaurant_id uuid not null, order_id uuid not null,
  amount_cents integer not null, payment_method text not null, status text not null,
  note text not null, idempotency_key uuid not null, payment_reference text,
  paid_at timestamptz not null
) on commit drop;
insert into approved_payment_manifest values
 ('4d964e9a-d45c-4917-8615-ccdd5240f460','246ebdf9-1ac2-4211-84ff-9b5163608374','19d90015-bcae-48a3-acfb-2241d1adbbc0',2550,'Card','completed','Table balance','15df8cbf-5a0c-4b99-9b6f-1c9f97060e4e',null,'2026-07-30 10:11:25.22159+00'),
 ('84531173-eb91-454e-a323-b48880fc9d13','246ebdf9-1ac2-4211-84ff-9b5163608374','d2525eee-951e-4ee5-b17f-336f8fa5d079',200,'Card','completed','Bill 1','d7474db0-9e93-4eda-9605-2b7357efe1bb',null,'2026-07-30 10:15:01.333297+00'),
 ('e8bfda76-59d9-4a6b-b687-68f77533bca0','246ebdf9-1ac2-4211-84ff-9b5163608374','d2525eee-951e-4ee5-b17f-336f8fa5d079',100,'Card','completed','Bill 1','4cca26e6-08d1-4c40-b6b1-02f94ca40682',null,'2026-07-30 10:15:12.709661+00'),
 ('bb2a1297-ce17-462d-8a3f-9a6e0c0fd3e0','246ebdf9-1ac2-4211-84ff-9b5163608374','d2525eee-951e-4ee5-b17f-336f8fa5d079',100,'Card','completed','Table balance','f973bf49-47fa-49ee-8758-d02906310d5c',null,'2026-07-30 10:15:57.029617+00'),
 ('784dd6da-2581-490d-9fe4-f0e8a294cc81','246ebdf9-1ac2-4211-84ff-9b5163608374','9238af74-f820-440d-8fc6-b36784343290',4150,'Card','completed','Table balance','e72f4584-ee39-4810-bae7-0fd381de3af9',null,'2026-07-30 12:25:26.844982+00'),
 ('7ca06b1f-4b27-467d-96a9-1580517383f2','246ebdf9-1ac2-4211-84ff-9b5163608374','837b6fb4-33b9-4df2-aaf0-e28f2e590219',13300,'Card','completed','Table balance','98db0257-cea2-4587-afcf-48cad65d7e7e',null,'2026-07-30 12:55:10.356242+00'),
 ('8719765b-9b68-45b3-8d88-1a68e86b3988','246ebdf9-1ac2-4211-84ff-9b5163608374','ad3b16a6-57b6-48ff-b20d-c341bea57094',6200,'Card','completed','Table balance','ff5ae846-1097-450c-9894-baf9ea6ee25c',null,'2026-07-30 13:17:59.850863+00'),
 ('b1c58a21-d2a0-4cbf-8135-139ee8235468','246ebdf9-1ac2-4211-84ff-9b5163608374','c7b7cd99-39af-4109-8b39-944e2a4cfb08',7550,'Card','completed','Table balance','1d983d86-a3d8-4a98-890c-ef8aae541bfa',null,'2026-07-30 13:19:09.730857+00'),
 ('ce4497e4-ec91-4408-a6b8-13ac0ab4b39b','246ebdf9-1ac2-4211-84ff-9b5163608374','ff0042d9-3a9d-4884-ba5d-ce3eb81df476',2850,'Card','completed','Table balance','317df334-5468-42a7-bdcc-edc8d6bdc206',null,'2026-07-30 13:28:19.118706+00'),
 ('bc6d7226-41bf-4f34-9eca-99d5560fed01','246ebdf9-1ac2-4211-84ff-9b5163608374','cb16615e-a17a-4621-b55c-fcf217ec4b67',3750,'Card','completed','Table balance','9d2f82b1-f853-4eb9-bc35-e5bcd9e4acb7',null,'2026-07-30 23:21:59.562317+00'),
 ('fb67144a-a8be-4f3c-b4a8-86b077a59250','246ebdf9-1ac2-4211-84ff-9b5163608374','e29ece3b-3b5a-4b63-8e6c-ed3ac763bdbd',8400,'Cash','completed','Table balance','835d8cdb-23f5-40e5-a6b6-bd1ffcfdec18',null,'2026-08-01 03:41:51.822193+00');

create temp table approved_order_manifest(order_id uuid primary key,restaurant_id uuid,status text,payment_status text,paid_at timestamptz,closed_at timestamptz,payment_method text,total_cents integer,payment_count integer,payment_cents integer) on commit drop;
insert into approved_order_manifest values
 ('19d90015-bcae-48a3-acfb-2241d1adbbc0','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 10:11:25.22159+00','2026-07-30 10:11:25.22159+00','Card',2550,1,2550),
 ('d2525eee-951e-4ee5-b17f-336f8fa5d079','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 10:15:57.029617+00','2026-07-30 10:15:57.029617+00','Card',400,3,400),
 ('9238af74-f820-440d-8fc6-b36784343290','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 12:25:26.844982+00','2026-07-30 12:25:26.844982+00','Card',4150,1,4150),
 ('837b6fb4-33b9-4df2-aaf0-e28f2e590219','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 12:55:10.356242+00','2026-07-30 12:55:10.356242+00','Card',13300,1,13300),
 ('ad3b16a6-57b6-48ff-b20d-c341bea57094','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 13:17:59.850863+00','2026-07-30 13:17:59.850863+00','Card',6200,1,6200),
 ('c7b7cd99-39af-4109-8b39-944e2a4cfb08','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 13:19:09.730857+00','2026-07-30 13:19:09.730857+00','Card',7550,1,7550),
 ('ff0042d9-3a9d-4884-ba5d-ce3eb81df476','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 13:28:19.118706+00','2026-07-30 13:28:19.118706+00','Card',2850,1,2850),
 ('cb16615e-a17a-4621-b55c-fcf217ec4b67','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-07-30 23:21:59.562317+00','2026-07-30 23:21:59.562317+00','Card',3750,1,3750),
 ('e29ece3b-3b5a-4b63-8e6c-ed3ac763bdbd','246ebdf9-1ac2-4211-84ff-9b5163608374','completed','paid','2026-08-01 03:41:51.822193+00','2026-08-01 03:41:51.822193+00','Cash',8400,1,8400);

do $$ declare n integer; begin
 if (select count(*) from approved_payment_manifest)<>11 or (select count(*) from approved_order_manifest)<>9 then raise exception 'MANIFEST_COUNT_DRIFT'; end if;
 if to_regclass('public.payment_operations') is not null then raise exception 'CANONICAL_LEDGER_ALREADY_EXISTS'; end if;
 if to_regprocedure('public.record_restaurant_order_payment(uuid,uuid,text)') is null or to_regprocedure('public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)') is null or to_regprocedure('public.void_restaurant_payment(uuid,uuid,text)') is null then raise exception 'LEGACY_PAYMENT_SURFACE_DRIFT'; end if;
 select count(*) into n from public.payments p join approved_payment_manifest m on m.payment_id=p.id where p.restaurant_id=m.restaurant_id and p.order_id=m.order_id and p.amount_cents=m.amount_cents and p.status=m.status and p.payment_method=m.payment_method and p.split_bill_id is null and p.idempotency_key=m.idempotency_key and p.note is not distinct from m.note and p.payment_reference is not distinct from m.payment_reference and p.paid_at=m.paid_at;
 if n<>11 then raise exception 'MANIFEST_PAYMENT_DRIFT'; end if;
 if exists(select 1 from public.payments p join approved_order_manifest m on m.order_id=p.order_id where p.id not in(select payment_id from approved_payment_manifest)) then raise exception 'UNAPPROVED_PAYMENT_DRIFT'; end if;
 select count(*) into n from public.orders o join approved_order_manifest m on m.order_id=o.id;
 if n<>9 then raise exception 'MANIFEST_ORDER_DRIFT'; end if;
 if exists(select 1 from public.orders o join approved_order_manifest m on m.order_id=o.id where o.restaurant_id is distinct from m.restaurant_id or o.status is distinct from m.status or o.payment_status is distinct from m.payment_status or o.paid_at is distinct from m.paid_at or o.closed_at is distinct from m.closed_at or o.payment_method is distinct from m.payment_method or round(o.total*100)::integer is distinct from m.total_cents) then raise exception 'MANIFEST_ORDER_DRIFT'; end if;
 if exists(select 1 from approved_order_manifest m join public.payments p on p.order_id=m.order_id and p.status='completed' group by m.order_id,m.payment_count,m.payment_cents having count(*)<>m.payment_count or sum(p.amount_cents)<>m.payment_cents) then raise exception 'MANIFEST_ORDER_TOTAL_DRIFT'; end if;
 if exists(select 1 from public.split_bills s join approved_order_manifest m on m.order_id=s.order_id) then raise exception 'MANIFEST_SPLIT_DRIFT'; end if;
end $$;

delete from public.payments where id in(select payment_id from approved_payment_manifest);
update public.orders o set payment_status='unpaid',paid_at=null,payment_method=null,closed_at=null where o.id in(select order_id from approved_order_manifest) and o.closed_at=(select m.closed_at from approved_order_manifest m where m.order_id=o.id);

create table public.payment_operations(id uuid primary key default gen_random_uuid(),restaurant_id uuid not null references public.restaurants(id) on delete restrict,order_id uuid not null references public.orders(id) on delete restrict,amount_cents integer not null check(amount_cents>0),payment_method text not null check(payment_method in ('Cash','Card','EFTPOS','Other')),payment_reference text not null default '' check(length(payment_reference)<=80),note text not null default '' check(length(note)<=200),idempotency_key uuid not null,payload_fingerprint text not null check(payload_fingerprint~'^[a-f0-9]{64}$'),recorded_by uuid not null references auth.users(id) on delete restrict,recorded_at timestamptz not null default now(),created_at timestamptz not null default now(),result_snapshot jsonb not null,unique(restaurant_id,idempotency_key));
create index payment_operations_restaurant_order_recorded_idx on public.payment_operations(restaurant_id,order_id,recorded_at desc,id desc);
alter table public.payment_operations enable row level security;
create policy "payment operations finance read" on public.payment_operations for select to authenticated using(public.has_restaurant_role(restaurant_id,array['owner','manager','cashier']));
revoke all on table public.payment_operations from public,anon,authenticated;

create or replace function public.record_authoritative_payment(p_restaurant_id uuid,p_order_id uuid,p_amount_cents integer,p_method text,p_reference text,p_note text,p_idempotency_key uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_role text; v_order public.orders; v_existing public.payment_operations; v_total integer; v_paid integer; v_fingerprint text; v_result jsonb; v_id uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid();
 if v_role is null or v_role not in ('owner','manager','cashier') then raise exception 'CASHIER_ROLE_REQUIRED'; end if;
 if p_amount_cents is null or p_amount_cents<=0 then raise exception 'INVALID_PAYMENT_AMOUNT'; end if;
 if p_method not in ('Cash','Card','EFTPOS','Other') then raise exception 'INVALID_PAYMENT_METHOD'; end if;
 if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
 if length(coalesce(p_reference,''))>80 or length(coalesce(p_note,''))>200 then raise exception 'PAYMENT_METADATA_TOO_LONG'; end if;
 if p_method='Other' and trim(coalesce(p_note,''))='' then raise exception 'OTHER_PAYMENT_NOTE_REQUIRED'; end if;
 v_fingerprint:=encode(extensions.digest(jsonb_build_object('restaurant_id',p_restaurant_id,'order_id',p_order_id,'amount_cents',p_amount_cents,'method',p_method,'reference',trim(coalesce(p_reference,'')),'note',trim(coalesce(p_note,'')))::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_restaurant_id::text||':'||p_idempotency_key::text,0)); select * into v_existing from public.payment_operations where restaurant_id=p_restaurant_id and idempotency_key=p_idempotency_key;
 if v_existing.id is not null then if v_existing.payload_fingerprint is distinct from v_fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result_snapshot||jsonb_build_object('idempotent_replay',true); end if;
 select * into v_order from public.orders where id=p_order_id and restaurant_id=p_restaurant_id for update; if v_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if; if v_order.status in ('voided','cancelled') then raise exception 'PAYMENT_NOT_ALLOWED_FOR_TERMINAL_ORDER'; end if;
 v_total:=round(v_order.total*100)::integer; if v_total<=0 then raise exception 'ORDER_NOT_PAYABLE'; end if; select coalesce(sum(amount_cents),0) into v_paid from public.payment_operations where restaurant_id=p_restaurant_id and order_id=p_order_id; if p_amount_cents>v_total-v_paid then raise exception 'PAYMENT_EXCEEDS_REMAINING_BALANCE'; end if;
 v_paid:=v_paid+p_amount_cents; v_id:=gen_random_uuid(); v_result:=jsonb_build_object('payment_id',v_id,'amount_cents',p_amount_cents,'paid_cents',v_paid,'remaining_cents',v_total-v_paid,'payment_status',case when v_paid=v_total then 'paid' else 'partial' end,'idempotent_replay',false);
 insert into public.payment_operations(id,restaurant_id,order_id,amount_cents,payment_method,payment_reference,note,idempotency_key,payload_fingerprint,recorded_by,result_snapshot) values(v_id,p_restaurant_id,p_order_id,p_amount_cents,p_method,trim(coalesce(p_reference,'')),trim(coalesce(p_note,'')),p_idempotency_key,v_fingerprint,auth.uid(),v_result);
 update public.orders set payment_status=case when v_paid=v_total then 'paid' else 'partial' end,paid_at=case when v_paid=v_total then coalesce(paid_at,now()) else null end,payment_method=case when v_paid=v_total then p_method else payment_method end,closed_at=case when v_paid=v_total then coalesce(closed_at,now()) else closed_at end,updated_at=now() where id=p_order_id and restaurant_id=p_restaurant_id; return v_result;
end $$;
alter function public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid) owner to postgres;

create or replace function public.list_authoritative_payment_operations(p_restaurant_id uuid,p_order_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$ declare v_role text; begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; select role into v_role from public.restaurant_staff where restaurant_id=p_restaurant_id and user_id=auth.uid(); if v_role is null or v_role not in ('owner','manager','cashier') then raise exception 'FINANCIAL_READ_ACCESS_DENIED'; end if; return coalesce((select jsonb_agg(jsonb_build_object('id',id,'order_id',order_id,'amount_cents',amount_cents,'payment_method',payment_method,'payment_reference',payment_reference,'note',note,'recorded_at',recorded_at,'recorded_by',recorded_by) order by recorded_at desc,id desc) from (select * from public.payment_operations where restaurant_id=p_restaurant_id and(p_order_id is null or order_id=p_order_id) order by recorded_at desc,id desc limit 1000) q),'[]'::jsonb); end $$;
alter function public.list_authoritative_payment_operations(uuid,uuid) owner to postgres;
revoke all on function public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid),public.list_authoritative_payment_operations(uuid,uuid) from public,anon;
grant execute on function public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid),public.list_authoritative_payment_operations(uuid,uuid) to authenticated;
revoke all on function public.record_restaurant_order_payment(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text) from public,anon,authenticated;
revoke all on function public.void_restaurant_payment(uuid,uuid,text) from public,anon,authenticated;
do $$ begin
 if has_function_privilege('public','public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)','execute') or has_function_privilege('anon','public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)','execute') or not has_function_privilege('authenticated','public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)','execute') then raise exception 'CANONICAL_WRITER_ACL_DRIFT'; end if;
 if has_function_privilege('public','public.list_authoritative_payment_operations(uuid,uuid)','execute') or has_function_privilege('anon','public.list_authoritative_payment_operations(uuid,uuid)','execute') or not has_function_privilege('authenticated','public.list_authoritative_payment_operations(uuid,uuid)','execute') then raise exception 'CANONICAL_LIST_ACL_DRIFT'; end if;
 if has_function_privilege('authenticated','public.record_restaurant_order_payment(uuid,uuid,text)','execute') or has_function_privilege('authenticated','public.record_restaurant_payment(uuid,uuid,integer,text,text,uuid,uuid,integer,integer,text)','execute') or has_function_privilege('authenticated','public.void_restaurant_payment(uuid,uuid,text)','execute') then raise exception 'LEGACY_PAYMENT_ACL_DRIFT'; end if;
 if exists(select 1 from public.payments p join approved_payment_manifest m on m.payment_id=p.id) then raise exception 'MANIFEST_DELETE_INCOMPLETE'; end if;
 if (select count(*) from public.orders o join approved_order_manifest m on m.order_id=o.id where o.payment_status='unpaid' and o.paid_at is null and o.closed_at is null and o.payment_method is null)=9 then null; else raise exception 'ORDER_CLEANUP_ROWCOUNT_DRIFT'; end if;
 if (select count(*) from public.orders o join approved_order_manifest m on m.order_id=o.id where o.status is distinct from m.status or o.payment_status is distinct from 'unpaid' or o.paid_at is not null or o.closed_at is not null or o.payment_method is not null)<>0 then raise exception 'ORDER_CLEANUP_INCOMPLETE'; end if;
end $$;
commit;
notify pgrst,'reload schema';
