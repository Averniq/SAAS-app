package com.aveniq.kitchen.printing;
import org.junit.Test;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.net.URI;
import java.util.Base64;
import java.util.concurrent.*;
public class SessionCancellationTest {
 @Test public void logoutInvalidatesPendingVerification()throws Exception{
  String operator="00000000-0000-0000-0000-000000000001",tenant="00000000-0000-0000-0000-000000000002";
  CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
  PrintApi api=new PrintApi(URI.create("http://127.0.0.1"),"public-test"){
   @Override String request(String method,String path,JSONObject body,String token)throws Exception{if(path.equals("/auth/v1/user")){entered.countDown();if(!release.await(3,TimeUnit.SECONDS))throw new Exception("TIMEOUT");return new JSONObject().put("id",operator).toString();}return "{}";}
  };
  long expiry=System.currentTimeMillis()/1000+600;String token="e30."+Base64.getUrlEncoder().withoutPadding().encodeToString(new JSONObject().put("sub",operator).put("exp",expiry).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8))+".signature";
  ExecutorService worker=Executors.newSingleThreadExecutor();try{Future<?> result=worker.submit(()->{try{api.setSession(token,expiry,tenant,operator);}catch(Exception expected){}});assertTrue(entered.await(3,TimeUnit.SECONDS));api.clearSession();release.countDown();result.get(3,TimeUnit.SECONDS);assertFalse("Logout must not restore the pending JWT",api.hasSession());}finally{release.countDown();worker.shutdownNow();}
 }
}
