#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LOCAL_RUNTIME_PROJECT = 'aveniq-p0-ui-runtime-20260908-local';
export const LOCAL_SAKE_RESTAURANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DB_CONTAINER = `supabase_db_${LOCAL_RUNTIME_PROJECT}`;
const EXPECTED_CATEGORIES = [
  'Soups', 'Mains', 'Salads', 'Sides', 'Cold Plates', 'Hot Plates',
  'Sashimi', 'Nigiri', 'Nigiri & Sashimi combo', 'Maki', 'Sushi rolls', 'Ramen',
];
const INTENTIONALLY_EMPTY_IMAGE_PRODUCTS = new Set([
  'mains\u0000karaage ramen',
  'sides\u0000spicy edamame',
]);

const restaurantKeys = new Set(['name', 'slug', 'restaurant_type', 'logo_url', 'subtitle', 'theme_config']);
const categoryKeys = new Set(['name', 'sort_order', 'is_active']);
const itemKeys = new Set([
  'category_name', 'name', 'description', 'price', 'image_url', 'photo_url', 'tags',
  'option_template', 'option_config', 'is_available', 'sold_out', 'is_active', 'sort_order',
]);

function fail(message) { throw new Error(`Invalid sanitized Sake catalogue: ${message}`); }
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
}
function keysOnly(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label}.${key} is not accepted (identity, auth, token, order, and payment fields are forbidden)`);
  }
  for (const key of allowed) if (!Object.hasOwn(value, key)) fail(`${label}.${key} is required`);
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be non-empty text`);
}
function integer(value, label) {
  if (!Number.isInteger(value)) fail(`${label} must be an integer`);
}
function bool(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean`);
}
function folded(value) { return value.trim().toLocaleLowerCase('en-AU'); }

/** Validate the strict, identity-free production export without transforming JSON values. */
export function validateSanitizedCatalogue(catalogue) {
  object(catalogue, 'catalogue');
  keysOnly(catalogue, new Set(['restaurant', 'categories', 'menu_items', 'counts']), 'catalogue');
  keysOnly(catalogue.counts, new Set(['categories', 'menu_items', 'with_tags', 'with_option_config', 'with_image_or_photo']), 'counts');
  for (const key of ['categories', 'menu_items', 'with_tags', 'with_option_config', 'with_image_or_photo']) integer(catalogue.counts[key], `counts.${key}`);
  if (catalogue.counts.categories !== 12 || catalogue.counts.menu_items !== 71 || catalogue.counts.with_tags !== 71 || catalogue.counts.with_option_config !== 71 || catalogue.counts.with_image_or_photo !== 69) {
    fail('counts must attest to 12 categories, 71 menu items, and 69 image/photo records');
  }
  keysOnly(catalogue.restaurant, restaurantKeys, 'restaurant');
  for (const key of ['name', 'slug', 'restaurant_type', 'logo_url', 'subtitle']) text(catalogue.restaurant[key], `restaurant.${key}`);
  object(catalogue.restaurant.theme_config, 'restaurant.theme_config');
  if (catalogue.restaurant.name !== 'Sake Street' || catalogue.restaurant.slug !== 'sake-street') {
    fail('restaurant must be the verified Sake Street / sake-street presentation');
  }
  if (!Array.isArray(catalogue.categories) || catalogue.categories.length !== 12) fail('catalogue must contain exactly 12 categories');
  if (!Array.isArray(catalogue.menu_items) || catalogue.menu_items.length !== 71) fail('catalogue must contain exactly 71 menu items');

  const categoryNames = new Set();
  for (const [index, category] of catalogue.categories.entries()) {
    keysOnly(category, categoryKeys, `categories[${index}]`);
    text(category.name, `categories[${index}].name`);
    integer(category.sort_order, `categories[${index}].sort_order`);
    bool(category.is_active, `categories[${index}].is_active`);
    const key = folded(category.name);
    if (categoryNames.has(key)) fail(`duplicate category name: ${category.name}`);
    categoryNames.add(key);
  }
  if (EXPECTED_CATEGORIES.some((name) => !categoryNames.has(folded(name)))) fail('categories do not match the verified 12-category Sake catalogue');

  const productNames = new Set();
  const emptyImageProducts = new Set();
  for (const [index, item] of catalogue.menu_items.entries()) {
    keysOnly(item, itemKeys, `menu_items[${index}]`);
    for (const key of ['category_name', 'name', 'description', 'option_template']) text(item[key], `menu_items[${index}].${key}`);
    for (const key of ['image_url', 'photo_url']) {
      if (typeof item[key] !== 'string') fail(`menu_items[${index}].${key} must be text`);
    }
    const productKey = `${folded(item.category_name)}\u0000${folded(item.name)}`;
    if (!item.image_url.trim() && !item.photo_url.trim()) {
      if (!INTENTIONALLY_EMPTY_IMAGE_PRODUCTS.has(productKey)) fail(`menu_items[${index}] has unexpected empty image metadata`);
      emptyImageProducts.add(productKey);
    }
    if (!categoryNames.has(folded(item.category_name))) fail(`menu_items[${index}].category_name does not resolve: ${item.category_name}`);
    if (typeof item.price !== 'number' || !Number.isFinite(item.price) || item.price < 0) fail(`menu_items[${index}].price must be a non-negative number`);
    integer(item.sort_order, `menu_items[${index}].sort_order`);
    for (const key of ['is_available', 'sold_out', 'is_active']) bool(item[key], `menu_items[${index}].${key}`);
    if (!Array.isArray(item.tags)) fail(`menu_items[${index}].tags must be a JSON array`);
    if (!Array.isArray(item.option_config)) fail(`menu_items[${index}].option_config must be a JSON array`);
    if (productNames.has(productKey)) fail(`duplicate category/name ambiguity: ${item.category_name} / ${item.name}`);
    productNames.add(productKey);
  }
  if (emptyImageProducts.size !== INTENTIONALLY_EMPTY_IMAGE_PRODUCTS.size || [...INTENTIONALLY_EMPTY_IMAGE_PRODUCTS].some((key) => !emptyImageProducts.has(key))) {
    fail('the only empty image metadata must be Mains / Karaage ramen and Sides / Spicy edamame');
  }
  return catalogue;
}

function docker(args, input) {
  const result = spawnSync('docker', args, { encoding: 'utf8', input });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'docker command failed').trim());
  return result.stdout.trim();
}
function psql(sql) {
  return docker(['exec', '-i', DB_CONTAINER, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At'], sql);
}
function localRuntimeReady() {
  const running = docker(['inspect', '-f', '{{.State.Running}}', DB_CONTAINER]);
  if (running !== 'true') throw new Error(`required local runtime ${LOCAL_RUNTIME_PROJECT} is not running`);
  const found = psql(`select id::text from public.restaurants where id = '${LOCAL_SAKE_RESTAURANT_ID}'::uuid`);
  if (found !== LOCAL_SAKE_RESTAURANT_ID) throw new Error('the expected local Sake restaurant UUID is absent; refusing to target another runtime');
}
function counts() {
  return JSON.parse(psql(`select json_build_object(
    'active_categories', (select count(*) from public.categories where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active),
    'active_menu_items', (select count(*) from public.menu_items where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active),
    'active_items_with_image_or_photo', (select count(*) from public.menu_items where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active and (nullif(image_url,'') is not null or nullif(photo_url,'') is not null)),
    'active_items_with_tags', (select count(*) from public.menu_items where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active and tags is not null),
    'active_items_with_option_config', (select count(*) from public.menu_items where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active and option_config is not null)
  )::text`));
}
function importTransaction(catalogue) {
  const payload = Buffer.from(JSON.stringify(catalogue), 'utf8').toString('base64');
  const sql = `begin;
with source as (select convert_from(decode('${payload}', 'base64'), 'UTF8')::jsonb as document)
update public.restaurants r set
  name=source.document->'restaurant'->>'name', slug=source.document->'restaurant'->>'slug',
  restaurant_type=source.document->'restaurant'->>'restaurant_type', logo_url=source.document->'restaurant'->>'logo_url',
  subtitle=source.document->'restaurant'->>'subtitle', theme_config=source.document->'restaurant'->'theme_config', updated_at=now()
from source where r.id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid;

update public.menu_items set is_active=false, is_available=false, sold_out=true, updated_at=now()
where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active;
update public.categories set name='__archived_sake_catalogue__'||id::text, is_active=false
where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active;

with source as (select convert_from(decode('${payload}', 'base64'), 'UTF8')::jsonb as document)
insert into public.categories (id, restaurant_id, name, sort_order, is_active)
select gen_random_uuid(), '${LOCAL_SAKE_RESTAURANT_ID}'::uuid, value->>'name', (value->>'sort_order')::integer, (value->>'is_active')::boolean
from source, jsonb_array_elements(source.document->'categories');

with source as (select convert_from(decode('${payload}', 'base64'), 'UTF8')::jsonb as document)
insert into public.menu_items (id, restaurant_id, category_id, name, description, price, image_url, photo_url, tags, option_template, option_config, is_available, sold_out, is_active, sort_order, local_id, category)
select gen_random_uuid(), '${LOCAL_SAKE_RESTAURANT_ID}'::uuid, c.id, value->>'name', value->>'description', (value->>'price')::numeric,
  value->>'image_url', value->>'photo_url', value->'tags', value->>'option_template', value->'option_config',
  (value->>'is_available')::boolean, (value->>'sold_out')::boolean, (value->>'is_active')::boolean, (value->>'sort_order')::integer,
  'sake-local-catalogue-'||substr(md5(lower(value->>'category_name')||chr(31)||lower(value->>'name')), 1, 24), value->>'category_name'
from source cross join lateral jsonb_array_elements(source.document->'menu_items') value
join public.categories c on c.restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and c.is_active and c.name=value->>'category_name';

do $$ declare v_categories integer; v_items integer; begin
  select count(*) into v_categories from public.categories where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active;
  select count(*) into v_items from public.menu_items where restaurant_id='${LOCAL_SAKE_RESTAURANT_ID}'::uuid and is_active;
  if v_categories <> 12 or v_items <> 71 then raise exception 'LOCAL_SAKE_IMPORT_POSTCONDITION_FAILED: categories %, items %', v_categories, v_items; end if;
end $$;
commit;`;
  psql(sql);
}

function usage() {
  console.error('Usage: node scripts/import-local-sake-product-catalogue.mjs --input <sanitized-catalogue.json> [--apply]');
}
function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;
  if (!inputPath || args.some((arg) => !['--input', inputPath, '--apply'].includes(arg))) { usage(); process.exitCode = 2; return; }
  const catalogue = validateSanitizedCatalogue(JSON.parse(readFileSync(inputPath, 'utf8')));
  console.log(JSON.stringify({ validated: true, target: LOCAL_RUNTIME_PROJECT, categories: catalogue.categories.length, menu_items: catalogue.menu_items.length }));
  if (!args.includes('--apply')) return;
  localRuntimeReady();
  const before = counts();
  importTransaction(catalogue);
  const after = counts();
  if (after.active_categories !== 12 || after.active_menu_items !== 71 || after.active_items_with_image_or_photo !== 69 || after.active_items_with_tags !== 71 || after.active_items_with_option_config !== 71) {
    throw new Error(`LOCAL_SAKE_IMPORT_POSTCONDITION_FAILED: ${JSON.stringify(after)}`);
  }
  console.log(JSON.stringify({ target: LOCAL_RUNTIME_PROJECT, before, after }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
