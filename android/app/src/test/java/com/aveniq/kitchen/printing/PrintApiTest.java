package com.aveniq.kitchen.printing;
import org.junit.Test;
import static org.junit.Assert.*;
import java.net.URI;
public class PrintApiTest {
 @Test public void debugBackendIsExplicitLocalOnlyAndReleaseIsTlsOnly(){assertTrue(PrintApi.isAllowedBackend(URI.create("http://10.0.2.2:59081"),true));assertTrue(PrintApi.isAllowedBackend(URI.create("http://127.0.0.1:59081"),true));for(String url:new String[]{"http://example.com","https://example.com","http://169.254.169.254","http://user@127.0.0.1","http://127.0.0.1/path","http://127.0.0.1?key=x"})assertFalse(url,PrintApi.isAllowedBackend(URI.create(url),true));assertFalse(PrintApi.isAllowedBackend(URI.create("http://127.0.0.1:59081"),false));assertTrue(PrintApi.isAllowedBackend(URI.create("https://example.invalid"),false));}

 @Test public void expiredJwtAndMismatchedOperatorNeverReachBackend()throws Exception{
  String operator=java.util.UUID.randomUUID().toString(),tenant=java.util.UUID.randomUUID().toString();int[] requests={0};
  PrintApi api=new PrintApi(URI.create("http://127.0.0.1:59081"),"synthetic"){@Override String request(String method,String route,org.json.JSONObject body,String token){requests[0]++;return "{}";}};
  for(boolean expired:new boolean[]{true,false}){
   long expiry=System.currentTimeMillis()/1000+(expired?-60:600);String subject=expired?operator:java.util.UUID.randomUUID().toString();
   String token="e30."+java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(new org.json.JSONObject().put("sub",subject).put("exp",expiry).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8))+".synthetic";
   try{api.setSession(token,expiry,tenant,operator);fail("Invalid authority accepted");}catch(PrintApi.ApiException expected){assertEquals(401,expected.status);}assertFalse(api.hasSession());
  }assertEquals(0,requests[0]);
 }
}
