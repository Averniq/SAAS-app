export const PRINT_PROFILE = Object.freeze({ name:'escpos-80mm-v1', columns:48, dots:576, maxBytes:256*1024 });
export const PRINT_STATUS = Object.freeze({ notConfigured:'Not Configured',agentOffline:'Agent Offline',unreachable:'Printer Unreachable',ready:'Ready',printing:'Printing',attention:'Attention Required' });
export function cleanTicketText(value, required=false) {
 if(value==null && !required) return '';
 if(typeof value!=='string' || (required && !value.trim()) || value.length>262144 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ud800-\udfff]/u.test(value)) throw new Error('SNAPSHOT_INVALID_TEXT');
 return value.replace(/[\r\n\t]+/g,' ').replace(/ +/g,' ').trim();
}
export function cellWidth(character) {
 const code=character.codePointAt(0);
 if(/\p{Mark}/u.test(character)) return 0;
 return code>=0x1100 && (code<=0x115f || code===0x2329 || code===0x232a || code>=0x2e80 && code<=0xa4cf || code>=0xac00 && code<=0xd7a3 || code>=0xf900 && code<=0xfaff || code>=0xfe10 && code<=0xfe6f || code>=0xff00 && code<=0xff60 || code>=0x1f000) ? 2 : 1;
}
export function wrapTicketText(text,columns=48) {
 const lines=[];let current='',width=0;
 for(const character of text) { const size=cellWidth(character); if(width+size>columns) { lines.push(current);current='';width=0; } current+=character;width+=size; }
 if(current || !lines.length) lines.push(current);
 return lines;
}
