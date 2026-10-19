package com.aveniq.kitchen.printing;
import org.json.JSONObject;
import java.io.IOException;
import java.util.UUID;

/** Durable authorization choreography, independent of Android lifecycle and transport. */
public final class AttemptEngine {
 public interface Rpc {Object call(String name,JSONObject args)throws Exception;}
 public interface Journal {JSONObject read()throws IOException;void save(JSONObject value)throws IOException;void clear();}
 public interface Output {TcpPrinter.Result send(JSONObject destination,byte[] bytes)throws Exception;}
 public interface Encoder {byte[] encode(JSONObject snapshot)throws Exception;}
 public record Registration(String deviceId,String secret,String restaurantId,String operatorId){@Override public String toString(){return "PrintRegistration[redacted]";}}
 public record Outcome(String state,String code){}
 private final Rpc api;private final Journal journal;private final Output output;private final Encoder encoder;
 public AttemptEngine(Rpc api,Journal journal,Output output,Encoder encoder){this.api=api;this.journal=journal;this.output=output;this.encoder=encoder;}
 private JSONObject arguments(JSONObject entry,Registration registration)throws Exception{return new JSONObject().put("p_device_id",registration.deviceId).put("p_device_secret",registration.secret).put("p_job_id",entry.getString("jobId")).put("p_claim_token",entry.getString("claimToken")).put("p_attempt_id",entry.getString("attemptId"));}
 private void checkScope(JSONObject entry,Registration r)throws IOException{if(r==null||!r.deviceId.equals(entry.optString("deviceId"))||!r.restaurantId.equals(entry.optString("restaurantId"))||!r.operatorId.equals(entry.optString("operatorId")))throw new IOException("PREVIOUS_ATTEMPT_REQUIRES_REVIEW");}
 private JSONObject outcome(JSONObject entry,TcpPrinter.Result result)throws Exception{JSONObject saved=new JSONObject(entry.toString()).put("stage","outcome").put("outcome",result.outcome());if(result.errorCode()!=null)saved.put("errorCode",result.errorCode());journal.save(saved);return saved;}
 private Outcome acknowledge(JSONObject entry,Registration registration)throws Exception{JSONObject args=arguments(entry,registration).put("p_outcome",entry.getString("outcome")).put("p_error_code",entry.has("errorCode")?entry.getString("errorCode"):JSONObject.NULL);Object value=api.call("finish_kitchen_print_attempt",args);if(!(value instanceof JSONObject)||!((JSONObject)value).optBoolean("accepted",false))throw new IOException("ACK_RESPONSE_INVALID");JSONObject result=(JSONObject)value;String state=result.getString("outcome");if(!java.util.Arrays.asList("not_sent","transmitted","uncertain").contains(state))throw new IOException("ACK_RESPONSE_INVALID");journal.clear();return new Outcome(state,entry.optString("errorCode",null));}
 public Outcome run(JSONObject claim,Registration registration)throws Exception{
  if(journal.read()!=null)throw new IOException("RECOVERY_REQUIRED");
  JSONObject entry=new JSONObject().put("jobId",claim.getString("jobId")).put("claimToken",claim.getString("claimToken")).put("attemptId",UUID.randomUUID().toString()).put("configRevision",claim.getLong("configRevision")).put("deviceId",registration.deviceId).put("restaurantId",registration.restaurantId).put("operatorId",registration.operatorId).put("stage","before_begin");
  journal.save(entry); // fsync before requesting authorization, including lost-response cases.
  JSONObject begun=(JSONObject)api.call("begin_kitchen_print_attempt",arguments(entry,registration).put("p_config_revision",entry.getLong("configRevision")));
  if(!registration.restaurantId.equals(begun.optString("restaurantId"))||!registration.operatorId.equals(begun.optString("operatorId"))||begun.getJSONObject("destination").getLong("configRevision")!=entry.getLong("configRevision"))throw new IOException("AUTHORIZATION_SCOPE_MISMATCH");
  byte[] bytes;try{bytes=encoder.encode(begun.getJSONObject("snapshot"));if(bytes==null||bytes.length<1||bytes.length>EscPosEncoder.MAX_BYTES)throw new IllegalArgumentException("PAYLOAD_TOO_LARGE");}catch(Exception error){String code="PAYLOAD_TOO_LARGE".equals(error.getMessage())?"PAYLOAD_TOO_LARGE":"SNAPSHOT_INVALID";return acknowledge(outcome(entry,new TcpPrinter.Result("not_sent",code)),registration);}
  entry=new JSONObject(entry.toString()).put("stage","consumed");journal.save(entry); // no socket can open until this commit succeeds.
  TcpPrinter.Result result;try{result=output.send(begun.getJSONObject("destination"),bytes);}catch(Exception ambiguous){result=new TcpPrinter.Result("uncertain","TRANSPORT_FAILED");}
  return acknowledge(outcome(entry,result),registration);
 }
 public Outcome recover(Registration registration)throws Exception{
  JSONObject entry=journal.read();if(entry==null)return new Outcome("idle",null);checkScope(entry,registration);AttemptJournal.Recovery policy=AttemptJournal.recoveryFor(entry.optString("stage"));if(policy==AttemptJournal.Recovery.ATTENTION)throw new IOException("JOURNAL_REQUIRES_REVIEW");
  JSONObject status=(JSONObject)api.call("inspect_kitchen_print_recovery",new JSONObject().put("p_job_id",entry.getString("jobId")).put("p_attempt_id",entry.getString("attemptId")).put("p_claim_token",entry.getString("claimToken")));
  if(!entry.getString("jobId").equals(status.optString("jobId"))||!registration.restaurantId.equals(status.optString("restaurantId")))throw new IOException("RECOVERY_SCOPE_MISMATCH");String state=status.getString("state");
  if(java.util.Arrays.asList("transmitted","uncertain","resolved","failed").contains(state)){journal.clear();return new Outcome(state,"uncertain".equals(state)?"RECOVERY_UNCERTAIN":null);}
  if("not_sent".equals(status.optString("attemptOutcome"))){journal.clear();return new Outcome("not_sent",null);}
  if(policy==AttemptJournal.Recovery.ACK_ONLY)return acknowledge(entry,registration);
  if(status.optBoolean("attemptStarted",false))return acknowledge(outcome(entry,new TcpPrinter.Result("uncertain","RECOVERY_UNCERTAIN")),registration);
  if(policy==AttemptJournal.Recovery.RECONCILE_BEFORE_BEGIN&&("retry_wait".equals(state)||"queued".equals(state)||!status.optBoolean("claimCurrent",true))){journal.clear();return new Outcome("not_sent",null);}
  return new Outcome("recovering","LEASE_RECONCILING");
 }
}
