package com.aveniq.kitchen.printing;
import android.Manifest;
import android.os.Build;
import com.aveniq.kitchen.SecureKitchenWebView;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import androidx.webkit.WebViewFeature;
import java.net.URI;
import java.util.function.Consumer;
import org.json.JSONObject;

@CapacitorPlugin(name="KitchenPrint",permissions={@Permission(alias="nearby",strings={Manifest.permission.NEARBY_WIFI_DEVICES}),@Permission(alias="local",strings={"android.permission.ACCESS_LOCAL_NETWORK"})})
public final class KitchenPrintPlugin extends Plugin {
 private PrintAgent agent;private Consumer<JSONObject> listener;
 public static boolean isPackagedOrigin(String url){try{URI uri=URI.create(url);return "https".equals(uri.getScheme())&&"localhost".equals(uri.getRawAuthority());}catch(Exception invalid){return false;}}
 @Override public void load(){agent=PrintAgent.get(getContext());listener=value->notifyListeners("kitchenPrintStatus",toJs(value));agent.attach(listener);}
 private static JSObject toJs(JSONObject object){try{return new JSObject(object.toString());}catch(Exception invalid){return new JSObject();}}
 static long expirySeconds(JSONObject data)throws java.io.IOException{Object value=data.opt("expiresAt");if(!(value instanceof Number))throw new java.io.IOException("INVALID_SESSION_EXPIRY");double seconds=((Number)value).doubleValue();if(!Double.isFinite(seconds)||seconds!=Math.rint(seconds)||seconds<=0||seconds>9007199254740991d)throw new java.io.IOException("INVALID_SESSION_EXPIRY");return ((Number)value).longValue();}
 private void guarded(PluginCall call,Runnable action){getActivity().runOnUiThread(()->{if(!isPackagedOrigin(getBridge().getWebView().getUrl())||!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)||!(getBridge().getWebView() instanceof SecureKitchenWebView)||((SecureKitchenWebView)getBridge().getWebView()).legacyBridgeBlocked()||getBridge().getAllowedOriginRules().size()!=1||!getBridge().getAllowedOriginRules().contains("https://localhost")){call.reject("PACKAGED_SECURE_WEBVIEW_REQUIRED");return;}action.run();});}
 private void execute(PluginCall call,PrintAgent.Action action){agent.submit(action,result->call.resolve(toJs(result)),call::reject);}
 @PluginMethod public void setSession(PluginCall call){guarded(call,()->{agent.stopNow(true);long expected=agent.sessionEpoch();execute(call,()->agent.setSession(call.getString("accessToken"),expirySeconds(call.getData()),call.getString("restaurantId"),call.getString("operatorId"),expected));});}
 @PluginMethod public void beginPairing(PluginCall call){guarded(call,()->execute(call,()->agent.beginPairing(call.getString("deviceName"))));}
 @PluginMethod public void activatePairing(PluginCall call){guarded(call,()->execute(call,()->agent.activatePairing(call.getString("pairingId"))));}
 private String networkPermission(){return Build.VERSION.SDK_INT>=37?"local":Build.VERSION.SDK_INT>=33?"nearby":null;}
 @PluginMethod public void start(PluginCall call){guarded(call,()->{String permission=networkPermission();if(permission!=null&&getPermissionState(permission)!=PermissionState.GRANTED){if(call.getBoolean("requestPermission",false)){call.getData().put("_permissionEpoch",agent.sessionEpoch());requestPermissionForAlias(permission,call,"networkPermissionResult");}else call.reject("LOCAL_NETWORK_PERMISSION_REQUIRED");return;}long expected=agent.sessionEpoch();execute(call,()->agent.start(true,expected));});}
 @PermissionCallback private void networkPermissionResult(PluginCall call){guarded(call,()->{if(call.getLong("_permissionEpoch",-1L)!=agent.sessionEpoch()){call.reject("SESSION_CANCELLED");return;}String permission=networkPermission();if(permission!=null&&getPermissionState(permission)!=PermissionState.GRANTED){call.reject("LOCAL_NETWORK_PERMISSION_REQUIRED");return;}long expected=agent.sessionEpoch();execute(call,()->agent.start(true,expected));});}
 @PluginMethod public void stop(PluginCall call){guarded(call,()->{agent.stopNow(call.getBoolean("clearSession",true));call.resolve(toJs(agent.status()));});}
 @PluginMethod public void getStatus(PluginCall call){guarded(call,()->call.resolve(toJs(agent.status())));}
 @Override protected void handleOnResume(){if(agent!=null)agent.foreground(true);}
 @Override protected void handleOnPause(){if(agent!=null)agent.foreground(false);}
 @Override protected void handleOnDestroy(){if(agent!=null){agent.foreground(false);agent.detach(listener);}}
}
