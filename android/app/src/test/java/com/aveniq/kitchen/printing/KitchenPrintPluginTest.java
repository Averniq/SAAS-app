package com.aveniq.kitchen.printing;
import org.junit.Test;
import static org.junit.Assert.*;
import com.getcapacitor.PluginMethod;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
public class KitchenPrintPluginTest {
 @Test public void bridgeHasNoRawSocketOrSecretReadMethod(){Set<String> methods=new HashSet<>();Arrays.stream(KitchenPrintPlugin.class.getDeclaredMethods()).filter(method->method.isAnnotationPresent(PluginMethod.class)).forEach(method->methods.add(method.getName()));assertEquals(new HashSet<>(Arrays.asList("setSession","beginPairing","activatePairing","start","stop","getStatus")),methods);}
 @Test public void onlyPackagedOriginIsEligible(){assertTrue(KitchenPrintPlugin.isPackagedOrigin("https://localhost/kitchen"));for(String url:new String[]{"http://localhost/","https://localhost.evil/","https://evil@localhost/","https://localhost:8443/","https://example.com/","file:///kitchen", ""})assertFalse(url,KitchenPrintPlugin.isPackagedOrigin(url));}
 @Test public void bridgeAcceptsIntegralEpochSecondsRegardlessOfJsonIntegerWidth()throws Exception{assertEquals(1800000000L,KitchenPrintPlugin.expirySeconds(new org.json.JSONObject("{\"expiresAt\":1800000000}")));assertEquals(2200000000L,KitchenPrintPlugin.expirySeconds(new org.json.JSONObject().put("expiresAt",2200000000L)));for(Object invalid:new Object[]{"1800000000",1.5,-1,0}){try{KitchenPrintPlugin.expirySeconds(new org.json.JSONObject().put("expiresAt",invalid));fail("invalid expiry accepted");}catch(java.io.IOException expected){}}}
}
