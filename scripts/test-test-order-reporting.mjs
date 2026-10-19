import {readFile} from 'node:fs/promises'; import assert from 'node:assert/strict';
const [sql,report,app]=await Promise.all([readFile(new URL('../supabase/migrations/022_exclude_test_orders_from_reporting.sql',import.meta.url),'utf8'),readFile(new URL('../supabase/migrations/009_reporting_layer.sql',import.meta.url),'utf8'),readFile(new URL('../app.js',import.meta.url),'utf8')]);
assert.match(sql,/where o\.is_test_order is not true/); assert.match(report,/reporting\.order_facts/); assert.match(app,/isTestOrder/); console.log('Test-order reporting structural checks passed.');
