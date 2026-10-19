package com.aveniq.kitchen.printing;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/** One foreground worker per app process. Every new claim first reconciles durable recovery. */
public final class PrintAgent {
 private static PrintAgent instance;
 public static synchronized PrintAgent get(Context context){if(instance==null)instance=new PrintAgent(context.getApplicationContext());return instance;}
 private final Context context;private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
 private final TcpPrinter transport=new TcpPrinter();private final AtomicLong generation=new AtomicLong();private final AtomicLong authorityGeneration=new AtomicLong();
 private final DeviceStore credentials,pending;private final AttemptJournal journal;private PrintApi api;private AttemptEngine engine;
 private volatile boolean foreground,desired,permission;private volatile JSONObject status;private volatile Consumer<JSONObject> listener;
 private final java.util.Map<String,Long> probeTimes=new java.util.HashMap<>();private int probeCursor;private long attemptGeneration;private String configurationError;private long heartbeatAt;private JSONArray assignments=new JSONArray();private ScheduledFuture<?> scheduled;
 private PrintAgent(Context context){this.context=context;credentials=new DeviceStore(context,"device");pending=new DeviceStore(context,"pairing");journal=new AttemptJournal(new DeviceStore(context,"attempt"));
  try{api=new PrintApi(context);engine=new AttemptEngine(api::rpc,journal,(destination,bytes)->{
   long current=attemptGeneration;if(!valid(current))return new TcpPrinter.Result("not_sent","AGENT_STOPPED");
   LanDestination.Approved approved;try{approved=LanDestination.approve(context,destination.getString("ip"),destination.getInt("port"),destination.getLong("configRevision"));}catch(Exception denied){return new TcpPrinter.Result("not_sent",safeCode(denied));}
   return transport.send(approved,bytes,()->valid(current));},EscPosEncoder::encode);
  }catch(Exception error){configurationError=safeCode(error);}
  publish("attention_required",configurationError==null?"SIGN_IN_REQUIRED":configurationError);
  ConnectivityManager network=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
  network.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback(){@Override public void onAvailable(Network n){transport.cancel();}@Override public void onLost(Network n){transport.cancel();}});
 }
 public void attach(Consumer<JSONObject> consumer){listener=consumer;consumer.accept(status());}
 public void detach(Consumer<JSONObject> consumer){if(listener==consumer)listener=null;}
 private static String safeCode(Exception error){String code=error.getMessage();return code!=null&&code.matches("[A-Z][A-Z0-9_]{1,63}")?code:"PRINT_AGENT_ATTENTION_REQUIRED";}
 private void publish(String state,String code){JSONObject value=new JSONObject();try{value.put("state",state).put("code",code==null?JSONObject.NULL:code).put("foreground",foreground).put("paperConfirmed",false);}catch(Exception ignored){}status=value;Consumer<JSONObject> consumer=listener;if(consumer!=null)consumer.accept(status());}
 public JSONObject status(){try{return new JSONObject(status.toString());}catch(Exception impossible){return new JSONObject();}}
 public interface Action {JSONObject run()throws Exception;}
 public void submit(Action action,Consumer<JSONObject> success,Consumer<String> failure){worker.execute(()->{try{if(api==null)throw new IOException(configurationError);success.accept(action.run());}catch(Exception error){String code=safeCode(error);publish("attention_required",code);failure.accept(code);}});}
 public void foreground(boolean value){foreground=value;generation.incrementAndGet();transport.cancel();worker.execute(()->{if(!value){cancelSchedule();publish("agent_offline","APP_IN_BACKGROUND");}else schedule();});}
 public void stopNow(boolean clearSession){desired=false;authorityGeneration.incrementAndGet();generation.incrementAndGet();transport.cancel();if(clearSession&&api!=null)api.clearSession();worker.execute(()->{cancelSchedule();publish("agent_offline",clearSession?"SIGN_IN_REQUIRED":"AGENT_STOPPED");});}
 public long sessionEpoch(){return authorityGeneration.get();}
 public JSONObject setSession(String token,long expiry,String tenant,String operator,long expected)throws Exception{if(authorityGeneration.get()!=expected)throw new IOException("SESSION_CANCELLED");api.setSession(token,expiry,tenant,operator);if(authorityGeneration.get()!=expected){api.clearSession();throw new IOException("SESSION_CANCELLED");}JSONObject previous=credentials.read();if(previous!=null&&(!tenant.equals(previous.optString("restaurantId"))||!operator.equals(previous.optString("operatorId"))))credentials.write(previous.put("invalidated",true));JSONObject waiting=pending.read();if(waiting!=null&&(!tenant.equals(waiting.optString("restaurantId"))||!operator.equals(waiting.optString("operatorId"))))pending.clear();heartbeatAt=0;assignments=new JSONArray();return status();}
 public JSONObject start(boolean permission,long expected)throws IOException{if(authorityGeneration.get()!=expected)throw new IOException("SESSION_CANCELLED");this.permission=permission;desired=true;schedule();return status();}
 private boolean valid(long epoch){return generation.get()==epoch&&foreground&&desired&&permission&&api!=null&&api.hasSession();}
 private void cancelSchedule(){if(scheduled!=null)scheduled.cancel(false);scheduled=null;}
 private void schedule(){if(scheduled==null&&foreground&&desired)scheduled=worker.scheduleWithFixedDelay(this::tick,0,2,TimeUnit.SECONDS);}
 private AttemptEngine.Registration registration()throws Exception{JSONObject stored=credentials.read();if(stored==null)return null;PrintApi.Session session=api.session();if(session==null||!stored.getString("restaurantId").equals(session.restaurantId())||!stored.getString("operatorId").equals(session.operatorId()))throw new IOException("DEVICE_OPERATOR_MISMATCH");if(stored.optBoolean("invalidated")&&journal.read()==null)throw new IOException("PAIRING_REQUIRED");return new AttemptEngine.Registration(stored.getString("deviceId"),stored.getString("secret"),stored.getString("restaurantId"),stored.getString("operatorId"));}
 private JSONObject proof(AttemptEngine.Registration registration)throws Exception{return new JSONObject().put("p_device_id",registration.deviceId()).put("p_device_secret",registration.secret());}
 public JSONObject beginPairing(String name)throws Exception{
  if(!api.hasSession())throw new IOException("SIGN_IN_REQUIRED");if(journal.read()!=null)throw new IOException("PREVIOUS_ATTEMPT_REQUIRES_REVIEW");
  if(name==null||name.trim().isEmpty()||name.length()>80)throw new IOException("DEVICE_NAME_REQUIRED");PrintApi.Session session=api.session();JSONObject previous=pending.read();
  if(previous!=null&&session.restaurantId().equals(previous.optString("restaurantId"))&&session.operatorId().equals(previous.optString("operatorId"))&&previous.has("pairingId")&&previous.optLong("expiresAtEpoch")>System.currentTimeMillis()/1000)return new JSONObject().put("pairingId",previous.getString("pairingId")).put("expiresAt",previous.getString("expiresAt"));
  byte[] random=new byte[32];new SecureRandom().nextBytes(random);StringBuilder secret=new StringBuilder();for(byte b:random)secret.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
  JSONObject stored=new JSONObject().put("secret",secret.toString()).put("restaurantId",session.restaurantId()).put("operatorId",session.operatorId());pending.write(stored);
  byte[] digest=MessageDigest.getInstance("SHA-256").digest(secret.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));StringBuilder hash=new StringBuilder();for(byte b:digest)hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
  JSONObject result=api.objectRpc("begin_kitchen_print_pairing",new JSONObject().put("p_restaurant_id",session.restaurantId()).put("p_device_name",name.trim()).put("p_secret_hash",hash.toString()));
  stored.put("pairingId",result.getString("pairingId")).put("expiresAt",result.getString("expiresAt")).put("expiresAtEpoch",java.time.OffsetDateTime.parse(result.getString("expiresAt")).toEpochSecond());pending.write(stored);return result;
 }
 public JSONObject activatePairing(String id)throws Exception{
  if(journal.read()!=null)throw new IOException("PREVIOUS_ATTEMPT_REQUIRES_REVIEW");JSONObject stored=pending.read();PrintApi.Session session=api.session();if(stored==null||session==null||!id.equals(stored.optString("pairingId"))||!session.restaurantId().equals(stored.optString("restaurantId"))||!session.operatorId().equals(stored.optString("operatorId")))throw new IOException("PAIRING_SCOPE_DENIED");
  JSONObject result=api.objectRpc("activate_kitchen_print_pairing",new JSONObject().put("p_pairing_id",id).put("p_secret",stored.getString("secret")));if(!"active".equals(result.optString("status")))throw new IOException("PAIRING_UNAVAILABLE");
  if(!session.restaurantId().equals(result.optString("restaurantId"))||!session.operatorId().equals(result.optString("operatorId")))throw new IOException("PAIRING_SCOPE_DENIED");
  credentials.write(new JSONObject().put("deviceId",result.getString("deviceId")).put("secret",stored.getString("secret")).put("restaurantId",session.restaurantId()).put("operatorId",session.operatorId()));pending.clear();heartbeatAt=0;return new JSONObject().put("deviceId",result.getString("deviceId"));
 }
 private void tick(){
  long epoch=generation.get();if(!valid(epoch)){publish("agent_offline",!permission?"LOCAL_NETWORK_PERMISSION_REQUIRED":api==null||!api.hasSession()?"SIGN_IN_REQUIRED":"AGENT_STOPPED");return;}
  try{AttemptEngine.Registration registration=registration();if(registration==null){publish("attention_required","PAIRING_REQUIRED");return;}
   AttemptEngine.Outcome recovery=engine.recover(registration);if("recovering".equals(recovery.state())){publish("printing","RECOVERY_RECONCILING");return;}
   if(!valid(epoch))return;JSONObject binding=credentials.read();if(binding!=null&&binding.optBoolean("invalidated")){publish("attention_required","PAIRING_REQUIRED");return;}
   if(System.currentTimeMillis()-heartbeatAt>=20000){JSONObject response=api.objectRpc("heartbeat_kitchen_print_device",proof(registration).put("p_observations",new JSONArray()));assignments=response.getJSONArray("printers");heartbeatAt=System.currentTimeMillis();}
   // Probe at most one approved destination per tick; no per-printer batch can delay recovery/claims.
   for(int scanned=0;scanned<Math.min(20,assignments.length())&&valid(epoch);scanned++){
    JSONObject printer=assignments.getJSONObject(Math.floorMod(probeCursor++,assignments.length()));String id=printer.getString("id");String revision=id+":"+printer.getLong("configRevision");
    if(!printer.optBoolean("enabled")||System.currentTimeMillis()-probeTimes.getOrDefault(revision,0L)<20000)continue;
    String observed;try{LanDestination.Approved approved=LanDestination.approve(context,printer.getString("ip"),printer.getInt("port"),printer.getLong("configRevision"));observed=transport.probe(approved,()->valid(epoch))?"reachable":"unreachable";}catch(Exception denied){observed="attention_required";}
    if(!valid(epoch))return;JSONArray observation=new JSONArray().put(new JSONObject().put("printerId",id).put("configRevision",printer.getLong("configRevision")).put("status",observed));
    JSONObject refreshed=api.objectRpc("heartbeat_kitchen_print_device",proof(registration).put("p_observations",observation));assignments=refreshed.getJSONArray("printers");heartbeatAt=System.currentTimeMillis();if(probeTimes.size()>100)probeTimes.clear();probeTimes.put(revision,heartbeatAt);break;
   }
   if(!valid(epoch))return;Object claim=api.rpc("claim_kitchen_printer_job",proof(registration));if(claim instanceof JSONObject){publish("printing","SENDING_TICKET");attemptGeneration=epoch;AttemptEngine.Outcome outcome=engine.run((JSONObject)claim,registration);publish("transmitted".equals(outcome.state())?"ready":"attention_required","transmitted".equals(outcome.state())?"PAPER_UNCONFIRMED":outcome.code());}else publish("ready","PAPER_STATUS_UNKNOWN");
  }catch(Exception error){publish("attention_required",safeCode(error));}
 }
}
