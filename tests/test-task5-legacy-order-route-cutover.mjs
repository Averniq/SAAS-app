import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.equal(/`\/order\/\$\{[^}]+\}\/\$\{[^}]+\}`/.test(source), false, 'active UI must not generate legacy slug/table order URLs');
assert.equal(source.includes('/table-1'), false, 'active UI must not invent table-1 customer routes');
console.log('Task 5 legacy order-route cutover regression: PASS');
