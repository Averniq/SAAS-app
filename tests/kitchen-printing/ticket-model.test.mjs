import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTicketModel } from '../../src/kitchen-printing/ticket-model.js';
const snapshot=JSON.parse(await readFile(new URL('../fixtures/kitchen-ticket-v1.json',import.meta.url),'utf8'));
test('ticket includes venue-local DST, quantities, modifiers, notes, destination and exact copy markers',()=>{
 const model=buildTicketModel(snapshot);
 assert.equal(model.copies.length,2);
 const text=model.copies[0].lines.map(line=>line.text).join('\n');
 for(const expected of ['Synthetic Sake Kitchen','ORDER 12345','Table 8','04/10/2026 12:30','Kitchen','2 x Chicken ramen','Size: Large','No chilli','No peanuts','COPY 1 OF 2']) assert.ok(text.includes(expected),expected);
 assert.ok(model.copies[1].lines.some(line=>line.text==='COPY 2 OF 2'));
});
test('one to three copies and explicit unverified profile',()=>{for(const copies of [1,2,3]) { const model=buildTicketModel({...snapshot,copies,autoCut:true});assert.equal(model.copies.length,copies);assert.equal(model.autoCut,true);assert.equal(model.profile,'escpos-80mm-v1'); }});
test('missing table label is explicit; long international names wrap without dropping text',()=>{
 const name='寿司 é'.repeat(30);const model=buildTicketModel({...snapshot,tableLabel:null,items:[{...snapshot.items[0],name}]});
 assert.ok(model.copies[0].lines.some(line=>line.text==='Table not specified'));
 const text=model.copies[0].lines.map(line=>line.text).join('');assert.ok(text.includes('寿司'));assert.equal((text.match(/寿司/g)||[]).length,30);
});
test('control injection, invalid quantities/copies, empty snapshots and oversized payload reject before output',()=>{
 for(const input of [null,{}, {...snapshot,items:[]},{...snapshot,copies:4},{...snapshot,items:[{...snapshot.items[0],quantity:1.5}]},{...snapshot,instructions:'x\x1b@'}, {...snapshot,instructions:'x\x1dV'}, {...snapshot,instructions:'\0'},{...snapshot,instructions:'x'.repeat(262145)}, {...snapshot,timezone:undefined}, {...snapshot,instructions:'\ud800'}]) assert.throws(()=>buildTicketModel(input));
});
test('line breaks and tabs normalize to readable spaces; winter time differs from DST',()=>{
 const model=buildTicketModel({...snapshot,createdAt:'2026-07-04T01:30:00Z',instructions:'No\r\npeanuts\tplease'});
 const text=model.copies[0].lines.map(line=>line.text).join('\n');assert.ok(text.includes('04/07/2026 11:30'));assert.ok(text.includes('No peanuts please'));
});


test('reject impossible calendar dates and non-ISO instants consistently with native',()=>{for(const createdAt of ['2026-02-30T12:00:00Z','October 4 2026Z','2026-10-04T24:00:00Z','2026-10-04T00:00:00+19:00']) assert.throws(()=>buildTicketModel({...snapshot,createdAt}));});
