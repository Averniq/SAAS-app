package com.aveniq.kitchen.printing;
import android.os.Build;
import android.os.Bundle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.aveniq.kitchen.MainActivity;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

/** Explicit local fixture only. The host intentionally force-stops the first process. */
@RunWith(AndroidJUnit4.class)
public class NativeBridgeAcceptanceTest {
 private ActivityScenario<MainActivity> scenario;
 private String evaluate(String script)throws Exception{AtomicReference<String> result=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);scenario.onActivity(activity->activity.getBridge().getWebView().evaluateJavascript(script,value->{result.set(value);done.countDown();}));if(!done.await(5,TimeUnit.SECONDS))throw new AssertionError("WEBVIEW_CALLBACK_TIMEOUT");return result.get();}
 private JSONObject call(String method,JSONObject args)throws Exception{
  evaluate("window.__kitchenAcceptance=null;(async()=>{try{window.__kitchenAcceptance={ok:true,value:await window.Capacitor.nativePromise('KitchenPrint',"+JSONObject.quote(method)+","+args.toString()+")};}catch(e){window.__kitchenAcceptance={ok:false,code:e.message};}})();");
  long deadline=System.currentTimeMillis()+25000;while(System.currentTimeMillis()<deadline){Object encoded=new JSONTokener(evaluate("JSON.stringify(window.__kitchenAcceptance)")).nextValue();if(encoded instanceof String){Object parsed=new JSONTokener((String)encoded).nextValue();if(parsed instanceof JSONObject){JSONObject response=(JSONObject)parsed;if(!response.optBoolean("ok"))throw new java.io.IOException(response.optString("code","BRIDGE_FAILED"));Object value=response.opt("value");return value instanceof JSONObject?(JSONObject)value:new JSONObject();}}Thread.sleep(100);}throw new AssertionError("NATIVE_BRIDGE_TIMEOUT");
 }
 @Test public void configuredLocalBridgeScenario()throws Exception{
  Bundle arguments=InstrumentationRegistry.getArguments();Assume.assumeTrue("Local fixture arguments required; never count this skip as acceptance", "true".equals(arguments.getString("localFixture")));
  assertTrue("Dedicated Android emulator required",Build.HARDWARE.equals("ranchu")&&Build.MODEL.startsWith("sdk_"));
  String token=arguments.getString("accessToken"),tenant=arguments.getString("restaurantId"),operator=arguments.getString("operatorId"),printer=arguments.getString("printerId"),phase=arguments.getString("phase");long expires=Long.parseLong(arguments.getString("expiresAt"));
  scenario=ActivityScenario.launch(MainActivity.class);
  try{
   long deadline=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<deadline&&!"\"function\"".equals(evaluate("typeof window.Capacitor?.nativePromise")))Thread.sleep(100);
   scenario.onActivity(activity->{assertTrue("Custom hardened WebView must be installed",activity.getBridge().getWebView() instanceof com.aveniq.kitchen.SecureKitchenWebView);assertTrue("Modern WebMessage listener supported",androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.WEB_MESSAGE_LISTENER));assertEquals("Exact singleton origin allowlist",java.util.Collections.singleton("https://localhost"),activity.getBridge().getAllowedOriginRules());assertFalse("No legacy bridge fallback; refused interfaces: "+((com.aveniq.kitchen.SecureKitchenWebView)activity.getBridge().getWebView()).blockedInterfaceNames(),((com.aveniq.kitchen.SecureKitchenWebView)activity.getBridge().getWebView()).legacyBridgeBlocked());assertTrue("Packaged origin loaded: "+activity.getBridge().getWebView().getUrl(),KitchenPrintPlugin.isPackagedOrigin(activity.getBridge().getWebView().getUrl()));});
   call("setSession",new JSONObject().put("accessToken",token).put("expiresAt",expires).put("restaurantId",tenant).put("operatorId",operator));
   PrintApi api=new PrintApi(InstrumentationRegistry.getInstrumentation().getTargetContext());api.setSession(token,expires,tenant,operator);
   if("pair-and-dispatch".equals(phase)){
    JSONObject pairing=call("beginPairing",new JSONObject().put("deviceName","Synthetic emulator acceptance"));
    api.rpc("approve_kitchen_print_pairing",new JSONObject().put("p_pairing_id",pairing.getString("pairingId")).put("p_printer_ids",new JSONArray().put(printer)));
    JSONObject registration=call("activatePairing",new JSONObject().put("pairingId",pairing.getString("pairingId")));assertTrue(registration.has("deviceId"));assertFalse(registration.has("secret"));
    try(java.io.InputStream input=new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("pm grant com.aveniq.kitchen android.permission.NEARBY_WIFI_DEVICES"))){input.readAllBytes();}
    call("start",new JSONObject().put("requestPermission",false));boolean heartbeat=false;deadline=System.currentTimeMillis()+15000;
    while(System.currentTimeMillis()<deadline){JSONArray devices=api.objectRpc("list_kitchen_printers",new JSONObject().put("p_restaurant_id",tenant)).getJSONArray("devices");for(int n=0;n<devices.length();n++){JSONObject device=devices.getJSONObject(n);if(registration.getString("deviceId").equals(device.optString("id"))&&!device.isNull("lastHeartbeat"))heartbeat=true;}if(heartbeat)break;Thread.sleep(200);}assertTrue("Native heartbeat reached the real local API",heartbeat);
    api.rpc("request_kitchen_test_print",new JSONObject().put("p_printer_id",printer).put("p_request_key",UUID.randomUUID().toString()));
    Thread.sleep(30000);fail("HOST_MUST_FORCE_STOP_AT_RPC_FAULT");
   }else if("resume".equals(phase)){
    for(int n=0;n<3;n++)call("start",new JSONObject().put("requestPermission",false));
    String expected=arguments.getString("expectedState"),jobId=arguments.getString("jobId");boolean settled=false;deadline=System.currentTimeMillis()+20000;
    while(System.currentTimeMillis()<deadline){JSONArray jobs=api.objectRpc("list_kitchen_printers",new JSONObject().put("p_restaurant_id",tenant)).getJSONArray("jobs");for(int n=0;n<jobs.length();n++){JSONObject job=jobs.getJSONObject(n);if(jobId.equals(job.optString("id"))&&expected.equals(job.optString("state")))settled=true;}if(settled&&new AttemptJournal(new DeviceStore(InstrumentationRegistry.getInstrumentation().getTargetContext(),"attempt")).read()==null)break;Thread.sleep(200);}
    assertTrue("Server reconciled expected recovery state",settled);assertNull(new AttemptJournal(new DeviceStore(InstrumentationRegistry.getInstrumentation().getTargetContext(),"attempt")).read());assertFalse(call("getStatus",new JSONObject()).optBoolean("paperConfirmed",true));call("stop",new JSONObject().put("clearSession",true));
   }else fail("EXPLICIT_LOCAL_PHASE_REQUIRED");
  }finally{if(scenario!=null)scenario.close();}
 }
}
