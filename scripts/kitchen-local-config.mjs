// Local validation only. Production packaging is deliberately a separate release approval.
export function validateLocalBackend(config,native=false){
 const url=new URL(config.origin);
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||!url.port||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Explicit loopback local API required');
 const key=config.publishableKey;
 let anonymous=false;try{anonymous=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{}
 if(typeof key!=='string'||(!key.startsWith('sb_publishable_')&&!anonymous))throw new Error('Public anonymous key required');
 if(native)url.hostname='10.0.2.2';
 return {origin:url.origin,publishableKey:key,localDebug:true};
}
