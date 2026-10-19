import { PRINT_PROFILE, cleanTicketText, wrapTicketText } from './contracts.js';
/** @param {import('./contracts.js').TicketSnapshotV1} snapshot */
export function buildTicketModel(snapshot) {
 if(!snapshot || snapshot.version!==1 || snapshot.profile!==PRINT_PROFILE.name || !Array.isArray(snapshot.items) || snapshot.items.length<1 || snapshot.items.length>500 || !Number.isInteger(snapshot.copies) || snapshot.copies<1 || snapshot.copies>3 || typeof snapshot.autoCut!=='boolean' || !['Kitchen','Bar','Dessert'].includes(snapshot.destination) || !['automatic','test','reprint'].includes(snapshot.kind)) throw new Error('SNAPSHOT_INVALID');
 if(new TextEncoder().encode(JSON.stringify(snapshot)).length>PRINT_PROFILE.maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
 const venue=cleanTicketText(snapshot.restaurantName,true), order=cleanTicketText(snapshot.orderNumber,true), table=cleanTicketText(snapshot.tableLabel)||'Table not specified';
 const dateText=cleanTicketText(snapshot.createdAt,true);
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(dateText);
 if(!match) throw new Error('INVALID_INSTANT');
 const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
 const days=[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
 if(month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59||Number(match[8]||0)>18||Number(match[9]||0)>59||Number(match[8]||0)===18&&Number(match[9]||0)!==0)throw new Error('INVALID_INSTANT');
 const instant=new Date(dateText);if(!Number.isFinite(instant.getTime())) throw new Error('INVALID_INSTANT');
 const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:cleanTicketText(snapshot.timezone,true),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const parts=Object.fromEntries(formatter.formatToParts(instant).map(part=>[part.type,part.value]));
 const localTime=`${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
 const body=[];const add=(text,large=false)=>wrapTicketText(text,large?24:48).forEach(text=>body.push({text,large}));
 add(venue);add(snapshot.destination);if(snapshot.kind!=='automatic') add(snapshot.kind==='test'?'*** TEST ONLY ***':'*** REPRINT ***');
 add(`ORDER ${order}`,true);add(table,true);add(localTime);add('-'.repeat(48));
 for(const item of snapshot.items) {
  if(!Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>99 || !Array.isArray(item.modifiers) || item.modifiers.length>100) throw new Error('SNAPSHOT_INVALID_ITEM');
  add(`${item.quantity} x ${cleanTicketText(item.name,true)}`);
  for(const modifier of item.modifiers) {
   const label=typeof modifier==='string'?cleanTicketText(modifier,true):`${cleanTicketText(modifier.groupName)}: ${cleanTicketText(modifier.choiceName,true)}`;
   add(`  ${label}`);
  }
  const note=cleanTicketText(item.notes);if(note) add(`  NOTE: ${note}`);
 }
 const instructions=cleanTicketText(snapshot.instructions);if(instructions) {add('-'.repeat(48));add(`INSTRUCTIONS: ${instructions}`);}
 const copies=Array.from({length:snapshot.copies},(_,index)=>({lines:[...body,{text:`COPY ${index+1} OF ${snapshot.copies}`,large:false}]}));
 return {version:1,profile:PRINT_PROFILE.name,autoCut:snapshot.autoCut,copies};
}
