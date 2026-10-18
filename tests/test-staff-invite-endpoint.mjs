import assert from 'node:assert/strict';
import { createStaffInviteHandler } from '../supabase/functions/staff-invite/handler.mjs';
const ids={restaurant:'11111111-1111-4111-8111-111111111111',request:'22222222-2222-4222-8222-222222222222',invite:'33333333-3333-4333-8333-333333333333',token:'44444444-4444-4444-8444-444444444444'};
const serverKey=['synthetic',btoa(JSON.stringify({role:'service_role'})),'private-test-only'].join('.');
const body={restaurantId:ids.restaurant,requestId:ids.request,email:'new@example.test',role:'staff',displayName:' Test Person '};
function harness(options={}) {
 const calls=[];
 const handler=createStaffInviteHandler({supabaseUrl:'http://127.0.0.1:54321',publicKey:'sb_publishable_synthetic',serverKey,appOrigin:'http://127.0.0.1:51463',fetch:async(url,init)=>{
  calls.push({url:String(url),...init});
  if(String(url).endsWith('/user')) return Response.json(options.authError?{}:{id:ids.restaurant}, {status:options.authError?401:200});
  if(String(url).includes('/rpc/')) return Response.json(options.rpcError||options.reservation||{id:ids.invite,token:ids.token,email:JSON.parse(init.body).p_email,role:body.role,delivery_required:options.required!==false},{status:options.rpcError?400:200});
  if(options.throwOtp) throw Error('synthetic transport');
  return Response.json(options.otpError||{}, {status:options.otpStatus||200});
 }});
 const request=(value=body,extra={})=>handler(new Request('http://localhost/functions/v1/staff-invite',{method:'POST',headers:{Authorization:'Bearer synthetic-user-jwt',Origin:'http://127.0.0.1:51463','Content-Type':'application/json',...extra.headers},body:typeof value==='string'?value:JSON.stringify(value),...extra}));
 return {calls,request,handler};
}
let checks=0;
for(const email of ['new@example.test','existing@example.test']){
 const h=harness(); const res=await h.request({...body,email});assert.equal(res.status,202);assert.equal(h.calls.length,3); const rpc=JSON.parse(h.calls[1].body);assert.equal(rpc.p_display_name,'Test Person');assert.equal(h.calls[0].headers.Authorization,'Bearer synthetic-user-jwt');assert.equal(h.calls[0].headers.apikey,'sb_publishable_synthetic');assert.equal(h.calls[1].headers.Authorization,'Bearer '+serverKey);assert.equal(h.calls[1].headers.apikey,serverKey);assert.ok(h.calls[1].url.endsWith('/rpc/reserve_staff_invitation_for_delivery'));assert.equal(rpc.p_actor_user_id,ids.restaurant); const otp=h.calls[2];assert.equal(new URL(otp.url).searchParams.get('redirect_to'),`http://127.0.0.1:51463/join/${ids.token}`);assert.deepEqual(JSON.parse(otp.body),{email,create_user:true});assert.equal(otp.headers.Authorization,'Bearer sb_publishable_synthetic');assert.equal(otp.headers.apikey,'sb_publishable_synthetic');assert.ok(!JSON.stringify(otp).includes(serverKey));assert.ok(!JSON.stringify(await res.json()).includes(ids.token));checks++;
}
for(const value of [{...body,role:'owner'},{...body,p_actor_user_id:ids.request},{...body,actorUserId:ids.request},{...body,displayName:'  '},{...body,redirectTo:'https://evil.test'},{...body,restaurantId:'bad'},{...body,email:'bad'},'x'.repeat(5000)]){const h=harness();assert.equal((await h.request(value)).status,400);assert.equal(h.calls.length,0);checks++;}
let h=harness({authError:true});assert.equal((await h.request()).status,401);assert.equal(h.calls.length,1);checks++;
h=harness();assert.equal((await h.request(body,{headers:{Origin:'https://evil.test','Content-Type':'application/json'}})).status,403);assert.equal(h.calls.length,0);checks++;
for(const message of ['FORBIDDEN','STAFF_MANAGEMENT_ACCESS_DENIED','AUTH_REQUIRED','ONLY_OWNER','STAFF_INVITE_COOLDOWN','MEMBERSHIP_EXISTS','STAFF_INVITE_CONFLICT']) {h=harness({rpcError:{message}}); const res=await h.request();assert.ok([403,409,429].includes(res.status));assert.equal(h.calls.length,2);checks++;}
for(const options of [{otpStatus:400},{otpStatus:429},{otpStatus:500},{throwOtp:true}]) {h=harness(options);const res=await h.request();assert.equal(res.status,202);assert.equal((await res.json()).delivery,'unconfirmed');assert.equal(h.calls.length,3);checks++;}
h=harness({required:false});assert.equal((await h.request()).status,202);assert.equal(h.calls.length,2);checks++;
h=harness();const pre=await h.handler(new Request('http://localhost',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:51463'}}));assert.equal(pre.status,204);assert.equal(h.calls.length,0);checks++;
for (const reservation of [null, {}, {id:ids.invite,token:'',email:body.email,role:'staff',delivery_required:true}, {id:ids.invite,token:ids.token,email:'foreign@example.test',role:'staff',delivery_required:true}, {id:ids.invite,token:ids.token,email:body.email,role:'owner',delivery_required:true}].filter(Boolean)) {
 const x=harness({reservation}); assert.equal((await x.request()).status,503); assert.equal(x.calls.length,2); checks++;
}
for (const headers of [{Authorization:'',Origin:'http://127.0.0.1:51463','Content-Type':'application/json'},{Authorization:'Bearer x',Origin:'http://127.0.0.1:51463','Content-Type':'text/plain'}]) {
 const x=harness(); assert.ok([400,401].includes((await x.request(body,{headers})).status)); assert.equal(x.calls.length,0);checks++;
}
for (const appOrigin of ['https://evil.test/path','https://user:pass@evil.test','http://example.test','https://app.example.test/?redirect=evil']) assert.throws(()=>createStaffInviteHandler({supabaseUrl:'http://localhost:54321',publicKey:'sb_publishable_synthetic',appOrigin}));
for(const publicKey of ['sb_secret_synthetic',['test',btoa(JSON.stringify({role:'service_role'})),'test'].join('.')])assert.throws(()=>createStaffInviteHandler({supabaseUrl:'http://localhost:54321',appOrigin:'http://localhost:3000',publicKey}));
for(const value of [undefined,'sb_publishable_synthetic','sb_secret_synthetic',['synthetic',btoa(JSON.stringify({role:'anon'})),'test'].join('.')]) assert.throws(()=>createStaffInviteHandler({supabaseUrl:'http://localhost:54321',publicKey:'sb_publishable_synthetic',serverKey:value,appOrigin:'http://localhost:3000'}));
h=harness({rpcError:{message:serverKey}});assert.ok(!(await (await h.request()).text()).includes(serverKey));checks++;
console.log(`Staff invitation endpoint: ${checks} checks passed`);
