/** Native methods carry no endpoint/bytes and expose no persistent device secret. */
export function createNativeAgent(capacitor=globalThis.window?.Capacitor){
 const available=Boolean(capacitor?.isNativePlatform?.()&&capacitor?.getPlatform?.()==='android'&&typeof capacitor.nativePromise==='function');
 const call=(method,options={})=>available?capacitor.nativePromise('KitchenPrint',method,options):Promise.reject(new Error('ANDROID_APP_REQUIRED'));
 return Object.freeze({available,setSession:session=>call('setSession',session),beginPairing:options=>call('beginPairing',{deviceName:options.deviceName}),activatePairing:options=>call('activatePairing',{pairingId:options.pairingId}),start:options=>call('start',{requestPermission:options?.requestPermission===true}),stop:options=>available?call('stop',{clearSession:options?.clearSession!==false}):Promise.resolve(),getStatus:()=>available?call('getStatus'):Promise.resolve({state:'agent_offline',code:'ANDROID_APP_REQUIRED',paperConfirmed:false}),subscribe:listener=>available?capacitor.addListener('KitchenPrint','kitchenPrintStatus',listener):{remove(){}}});
}
