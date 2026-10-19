package com.aveniq.kitchen.printing;

import android.content.Context;
import com.aveniq.kitchen.BuildConfig;
import org.json.JSONObject;
import java.io.*;
import java.net.URI;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.*;

/** The only backend origin is packaged. JWT refresh belongs to the foreground web app. */
public class PrintApi {
 public record Session(String token,long expiresAt,String restaurantId,String operatorId) {@Override public String toString(){return "StaffSession[redacted]";}}
 public static final class ApiException extends IOException {public final int status;public final String code;ApiException(int status,String code){super(code);this.status=status;this.code=code;}}
 private final URI origin;private final String publicKey;private volatile Session session;private final Object sessionLock=new Object();private long sessionGeneration;
 private static final ScheduledExecutorService DEADLINES=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"kitchen-api-deadline");t.setDaemon(true);return t;});
 public static boolean isAllowedBackend(URI uri,boolean debug){if(uri==null||uri.getHost()==null||uri.getUserInfo()!=null||uri.getRawQuery()!=null||uri.getRawFragment()!=null||!(uri.getPath().isEmpty()||uri.getPath().equals("/")))return false;return debug?(uri.getHost().equals("127.0.0.1")||uri.getHost().equals("10.0.2.2"))&&(uri.getScheme().equals("http")||uri.getScheme().equals("https")):uri.getScheme().equals("https");}
 public PrintApi(Context context) throws Exception {
  JSONObject config;try(InputStream input=context.getAssets().open("kitchen-print-backend.json")){config=new JSONObject(readBounded(input,32768));}
  boolean local=config.optBoolean("localDebug",false);if(local&&!BuildConfig.DEBUG || BuildConfig.DEBUG&&!local)throw new IOException("LOCAL_BACKEND_CONFIGURATION_REQUIRED");origin=URI.create(config.getString("origin"));if(!isAllowedBackend(origin,local))throw new IOException("BACKEND_ORIGIN_DENIED");publicKey=config.getString("publishableKey");if(!publicKey.startsWith("sb_publishable_")&&!"anon".equals(jwt(publicKey).optString("role")))throw new IOException("PUBLIC_KEY_REQUIRED");
 }
 PrintApi(URI origin,String publicKey){this.origin=origin;this.publicKey=publicKey;}
 private static JSONObject jwt(String token) throws Exception {if(token==null||token.length()>16384)throw new IOException("SIGN_IN_REQUIRED");String[] parts=token.split("\\.");if(parts.length!=3)throw new IOException("SIGN_IN_REQUIRED");return new JSONObject(new String(Base64.getUrlDecoder().decode(parts[1]),StandardCharsets.UTF_8));}
 public void setSession(String token,long expiresAt,String restaurantId,String operatorId) throws Exception {
  long generation;synchronized(sessionLock){generation=++sessionGeneration;session=null;}UUID.fromString(restaurantId);UUID.fromString(operatorId);JSONObject claims=jwt(token);long expiry=Math.min(expiresAt,claims.getLong("exp"));if(expiry<=System.currentTimeMillis()/1000+5||!operatorId.equals(claims.getString("sub")))throw new ApiException(401,"SIGN_IN_REQUIRED");
  JSONObject verified=new JSONObject(request("GET","/auth/v1/user",null,token));if(!operatorId.equals(verified.optString("id")))throw new ApiException(403,"OPERATOR_MISMATCH");
  request("POST","/rest/v1/rpc/list_kitchen_printers",new JSONObject().put("p_restaurant_id",restaurantId),token);
  synchronized(sessionLock){if(sessionGeneration!=generation)throw new IOException("SESSION_CANCELLED");session=new Session(token,expiry,restaurantId,operatorId);}
 }
 public void clearSession(){synchronized(sessionLock){sessionGeneration++;session=null;}}
 public Session session(){return session;}
 public boolean hasSession(){Session current=session;return current!=null&&current.expiresAt>System.currentTimeMillis()/1000;}
 public Object rpc(String function,JSONObject args) throws Exception {if(!function.matches("[a-z_]{1,80}"))throw new IOException("RPC_DENIED");Session current=session;if(current==null||current.expiresAt<=System.currentTimeMillis()/1000)throw new ApiException(401,"SIGN_IN_REQUIRED");String result=request("POST","/rest/v1/rpc/"+function,args,current.token);return new org.json.JSONTokener(result).nextValue();}
 public JSONObject objectRpc(String function,JSONObject args) throws Exception {Object result=rpc(function,args);if(!(result instanceof JSONObject))throw new IOException("API_RESPONSE_INVALID");return (JSONObject)result;}
 String request(String method,String path,JSONObject body,String token) throws Exception {
  HttpURLConnection connection=(HttpURLConnection)origin.resolve(path).toURL().openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(5000);connection.setReadTimeout(8000);connection.setRequestMethod(method);connection.setRequestProperty("apikey",publicKey);connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Accept","application/json");ScheduledFuture<?> deadline=DEADLINES.schedule(connection::disconnect,10,TimeUnit.SECONDS);
  try{if(body!=null){byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>65536)throw new IOException("API_REQUEST_TOO_LARGE");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream output=connection.getOutputStream()){output.write(bytes);}}
   int status=connection.getResponseCode();if(status>=300&&status<400)throw new ApiException(status,"API_REDIRECT_REFUSED");String response;try(InputStream input=status>=200&&status<300?connection.getInputStream():connection.getErrorStream()){response=input==null?"":readBounded(input,512*1024);}
   if(status<200||status>=300){String code="API_REQUEST_FAILED";try{String message=new JSONObject(response).optString("message");if(message.matches("[A-Z][A-Z0-9_]{1,63}"))code=message;}catch(Exception ignored){}throw new ApiException(status,code);}return response;
  }finally{deadline.cancel(false);connection.disconnect();}
 }
 private static String readBounded(InputStream input,int max) throws IOException {ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1){if(output.size()+n>max)throw new IOException("API_RESPONSE_TOO_LARGE");output.write(buffer,0,n);}try{return StandardCharsets.UTF_8.newDecoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(output.toByteArray())).toString();}catch(java.nio.charset.CharacterCodingException error){throw new IOException("API_RESPONSE_INVALID");}}
}
