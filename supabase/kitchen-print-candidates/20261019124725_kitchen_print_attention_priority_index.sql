begin;
create index kitchen_jobs_printer_attention_priority on public.kitchen_print_jobs(restaurant_id,printer_id,(case state when 'uncertain' then 0 when 'dispatching' then 1 when 'leased' then 2 else 3 end),created_at,id) where state in('leased','dispatching','uncertain','retry_wait');
drop index public.kitchen_jobs_printer_attention;
commit;
