import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocalBackend } from '../../scripts/kitchen-local-config.mjs';
test('local packaging permits only explicit loopback and the Android emulator alias',()=>{
 assert.equal(validateLocalBackend({origin:'http://127.0.0.1:59081',publishableKey:'sb_publishable_synthetic'},false).origin,'http://127.0.0.1:59081');
 assert.equal(validateLocalBackend({origin:'http://127.0.0.1:59081',publishableKey:'sb_publishable_synthetic'},true).origin,'http://10.0.2.2:59081');
 for(const origin of ['https://example.com','http://192.168.1.1','http://127.0.0.1@evil.com','http://127.0.0.1/path','http://127.0.0.1?key=x'])assert.throws(()=>validateLocalBackend({origin,publishableKey:'sb_publishable_synthetic'},false));
 for(const role of ['service_role','authenticated'])assert.throws(()=>validateLocalBackend({origin:'http://127.0.0.1:59081',publishableKey:'e30.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.x'},true));
});
