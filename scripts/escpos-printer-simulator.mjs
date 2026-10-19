import net from 'node:net';
import {mkdir,realpath,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const modes=new Set(['capture','refuse','disconnect_after_n_bytes','stall']);
/** Synthetic transport evidence only: no mode asserts paper delivery or cutter compatibility. */
export async function startPrinterSimulator({host='127.0.0.1',port=0,mode='capture',outputDir=null,disconnectAfterBytes=16,maxCaptureBytes=262144}={}){
 if(net.isIPv4(host)!==true||!(host==='127.0.0.1'||host.startsWith('10.')||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host))||!Number.isInteger(port)||port<0||port>65535||host!=='127.0.0.1'&&port===0||!modes.has(mode)||!Number.isInteger(disconnectAfterBytes)||disconnectAfterBytes<1||disconnectAfterBytes>262144||!Number.isInteger(maxCaptureBytes)||maxCaptureBytes<1||maxCaptureBytes>262144)throw new Error('Invalid explicit local simulator configuration');
 let directory;if(outputDir){directory=path.resolve(root,outputDir);const allowed=path.join(root,'.kitchen-local')+path.sep;if(!directory.startsWith(allowed))throw new Error('Captures must be under the ignored .kitchen-local directory');await mkdir(directory,{recursive:true});directory=await realpath(directory);if(!directory.startsWith(allowed))throw new Error('Capture directory junction denied');}
 const sockets=new Set(),captures=[],waiters=new Set(),writes=new Set();let connectionCount=0,closed=false,closing=null;
 function notify(capture){for(const waiter of waiters)if(capture.connectionId===waiter.number){waiters.delete(waiter);clearTimeout(waiter.timer);waiter.resolve(capture);}}
 const server=net.createServer(socket=>{
  if(connectionCount>=10000){socket.destroy();return;}const connectionId=++connectionCount,openedAt=new Date().toISOString();sockets.add(socket);let chunks=[],receivedBytes=0,buffered=0,errorCode=null;
  socket.setTimeout(20000,()=>socket.destroy());socket.on('error',error=>{errorCode=error.code||'SOCKET_ERROR';});
  socket.on('data',chunk=>{receivedBytes+=chunk.length;const remaining=maxCaptureBytes-buffered;if(remaining>0){chunks.push(chunk.subarray(0,remaining));buffered+=Math.min(chunk.length,remaining);}if(receivedBytes>maxCaptureBytes||mode==='disconnect_after_n_bytes'&&receivedBytes>=disconnectAfterBytes){if(socket.resetAndDestroy)socket.resetAndDestroy();else socket.destroy();}});
  socket.on('end',()=>socket.end());socket.on('close',()=>{
   sockets.delete(socket);const bytes=Buffer.concat(chunks);chunks=[];const capture={connectionId,openedAt,closedAt:new Date().toISOString(),mode,syntheticOnly:true,paperConfirmed:false,receivedBytes,truncated:receivedBytes>maxCaptureBytes,bytes,sha256:createHash('sha256').update(bytes).digest('hex'),errorCode};captures.push(capture);if(captures.length>100)captures.shift();
   if(directory){const prefix=path.join(directory,`${String(connectionId).padStart(6,'0')}-${randomUUID()}`);const {bytes:_,...metadata}=capture;const write=Promise.all([writeFile(prefix+'.bin',bytes,{flag:'wx'}),writeFile(prefix+'.json',JSON.stringify(metadata,null,2),{flag:'wx'})]);writes.add(write);write.catch(()=>{capture.captureWriteFailed=true;}).finally(()=>writes.delete(write));}
   notify(capture);
  });if(mode==='stall')socket.pause();
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen({host,port},resolve);});const address={host,port:server.address().port};
 if(mode==='refuse')await new Promise(resolve=>server.close(resolve));
 return {address,captures,get connectionCount(){return connectionCount;},waitForCapture(number,timeoutMs=5000){const found=captures.find(capture=>capture.connectionId===number);if(found)return Promise.resolve(found);if(!Number.isInteger(number)||number<1||timeoutMs<1||timeoutMs>30000)return Promise.reject(new Error('Invalid capture wait'));return new Promise((resolve,reject)=>{const waiter={number,resolve,reject,timer:setTimeout(()=>{waiters.delete(waiter);reject(new Error('CAPTURE_TIMEOUT'));},timeoutMs)};waiters.add(waiter);});},close(){if(closing)return closing;closed=true;closing=(async()=>{for(const socket of sockets)socket.destroy();if(server.listening)await new Promise(resolve=>server.close(resolve));for(const waiter of waiters){clearTimeout(waiter.timer);waiter.reject(new Error('SIMULATOR_CLOSED'));}waiters.clear();await Promise.allSettled([...writes]);})();return closing;}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={port:9100};for(let n=0;n<args.length;n+=2){const names={'--host':'host','--port':'port','--mode':'mode','--output-dir':'outputDir','--disconnect-after-bytes':'disconnectAfterBytes'};const name=names[args[n]];if(!name||args[n+1]===undefined)throw new Error('Unknown or incomplete simulator option');options[name]=['port','disconnectAfterBytes'].includes(name)?Number(args[n+1]):args[n+1];}
 const simulator=await startPrinterSimulator(options);console.log(`Synthetic ESC/POS simulator ${options.mode||'capture'} on ${simulator.address.host}:${simulator.address.port}; paper is unconfirmed.`);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>simulator.close().then(()=>process.exit(0)));
}
