package com.aveniq.kitchen.printing;

import android.content.Context;
import java.security.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public final class PrintAgent {
  private final RunGuard runGuard = new RunGuard();
  private final PrintApi api;
  private final DeviceStore store;
  private final AttemptJournal journal;
  private final TcpPrinter tcp;
  private final FaultCheckpoint checkpoint;
  private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor();
  private volatile boolean enabled = false, foreground = true;
  private ScheduledFuture<?> future;
  private volatile String state = "Agent Offline", message = "Keep Kitchen open to print";
  private long heartbeat;
  private boolean printersReachable = false, printerAttention = false;

  public PrintAgent(Context c) throws Exception {
    this(c, FaultCheckpoint.NONE);
  }

  PrintAgent(Context c, FaultCheckpoint checkpoint) throws Exception {
    if (checkpoint != FaultCheckpoint.NONE
        && (c.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0)
      throw new SecurityException("DEBUG_FAULT_INJECTION_ONLY");
    this.checkpoint = checkpoint;
    api = new PrintApi(c);
    store = new DeviceStore(c);
    journal = new AttemptJournal(store);
    tcp = new TcpPrinter(c);
  }

  public JSONObject status() throws Exception {
    return new JSONObject()
        .put("state", state)
        .put("message", message)
        .put("paired", store.load("device") != null);
  }

  public synchronized void session(String token, long expires, String uid, String rid) {
    if (!uid.equals(api.operator()) || !rid.equals(api.restaurant())) {
      runGuard.invalidate();
      tcp.cancel();
    }
    api.session(token, expires, uid, rid);
  }

  public synchronized void start() {
    if (!enabled) runGuard.invalidate();
    enabled = true;
    if (future == null)
      future = executor.scheduleWithFixedDelay(this::safeTick, 0, 4, TimeUnit.SECONDS);
  }

  public synchronized void stop() {
    runGuard.invalidate();
    enabled = false;
    tcp.cancel();
    if (future != null) {
      future.cancel(false);
      future = null;
    }
    state = "Agent Offline";
  }

  public void foreground(boolean value) {
    foreground = value;
    if (!value) {
      runGuard.invalidate();
      tcp.cancel();
    }
  }

  public void logout() {
    stop();
    api.clear();
  }

  public void destroy() {
    stop();
    executor.shutdownNow();
  }

  private void set(String s, String m) {
    state = s;
    message = m;
  }

  private JSONObject auth(JSONObject device) throws Exception {
    return new JSONObject()
        .put("p_device_id", device.getString("deviceId"))
        .put("p_device_secret", device.getString("secret"));
  }

  private static String hex(byte[] data) {
    StringBuilder s = new StringBuilder();
    for (byte b : data) s.append(String.format(Locale.ROOT, "%02x", b & 255));
    return s.toString();
  }

  public JSONObject pair(String rid, String name) throws Exception {
    if (!rid.equals(api.restaurant())) throw new SecurityException("RESTAURANT_SESSION_MISMATCH");
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    String secret = hex(bytes);
    String hash =
        hex(
            MessageDigest.getInstance("SHA-256")
                .digest(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    JSONObject result =
        (JSONObject)
            api.rpc(
                "begin_kitchen_print_pairing",
                new JSONObject()
                    .put("p_restaurant_id", rid)
                    .put("p_device_name", name)
                    .put("p_secret_hash", hash));
    store.save(
        "pairing",
        new JSONObject()
            .put("id", result.getString("id"))
            .put("secret", secret)
            .put("operator", api.operator())
            .put("restaurant", rid));
    return result;
  }

  public void activate(String id) throws Exception {
    JSONObject pending = store.load("pairing");
    if (pending == null
        || !pending.getString("id").equals(id)
        || !pending.getString("operator").equals(api.operator()))
      throw new SecurityException("PAIRING_NOT_AVAILABLE");
    JSONObject result =
        (JSONObject)
            api.rpc(
                "activate_kitchen_print_pairing",
                new JSONObject()
                    .put("p_pairing_id", id)
                    .put("p_secret", pending.getString("secret")));
    if (result.has("error")) throw new SecurityException(result.getString("error"));
    result.put("secret", pending.getString("secret")).put("operator", api.operator());
    store.save("device", result);
    store.remove("pairing");
  }

  private void safeTick() {
    if (!enabled || !foreground) return;
    try {
      tick();
    } catch (Exception e) {
      String m = e.getMessage();
      set(
          "Attention Required",
          m == null
              ? "Printing needs attention"
              : m.replaceAll("[^A-Za-z0-9_ -]", " ").substring(0, Math.min(m.length(), 120)));
    }
  }

  private String acknowledge(JSONObject device, JSONObject record) throws Exception {
    JSONObject payload =
        auth(device)
            .put("p_job_id", record.getString("jobId"))
            .put("p_claim_token", record.getString("claimToken"))
            .put("p_attempt_id", record.getString("attemptId"))
            .put("p_outcome", record.optString("outcome", "uncertain"))
            .put("p_error_code", record.optString("errorCode", "APP_RESTART_OR_ACK_LOSS"));
    JSONObject reply;
    try {
      reply = (JSONObject) api.rpc("finish_kitchen_print_attempt", payload);
    } catch (Exception e) {
      if (!"PRINT_OUTCOME_CONFLICT".equals(e.getMessage())
          || !Arrays.asList("transmitted", "not_sent").contains(record.optString("outcome")))
        throw e;
      // A late completion may already be quarantined server-side. Reconcile only towards
      // uncertainty: never retry output or weaken the server's immutable outcome.
      record.put("outcome", "uncertain").put("errorCode", "LATE_ACK_QUARANTINED");
      journal.write(record);
      reply =
          (JSONObject)
              api.rpc(
                  "finish_kitchen_print_attempt",
                  payload
                      .put("p_outcome", "uncertain")
                      .put("p_error_code", "LATE_ACK_QUARANTINED"));
    }
    String reconciled = reply.getString("state");
    if (!Arrays.asList("transmitted", "uncertain", "retry_wait", "failed").contains(reconciled))
      throw new IllegalStateException("INVALID_ACK_STATE");
    journal.clear();
    if ("uncertain".equals(reconciled))
      set("Attention Required", "Delivery uncertain; check paper before resolving print history");
    return reconciled;
  }

  public void tick() throws Exception {
    long run = runGuard.capture();
    JSONObject device = store.load("device");
    if (device == null) {
      set("Not Configured", "Pair this tablet with your restaurant");
      return;
    }
    if (!device.getString("operator").equals(api.operator())
        || !device.getString("restaurantId").equals(api.restaurant()))
      throw new SecurityException("PAIR_AGAIN_FOR_THIS_ACCOUNT");
    JSONObject pending = journal.pending();
    if (pending != null) {
      if (!device.getString("deviceId").equals(pending.optString("deviceId"))) {
        journal.archivePending();
        set(
            "Attention Required",
            "Old device attempt preserved; check its printer before resolving server uncertainty");
        return;
      }
      try {
        acknowledge(device, pending);
      } catch (Exception e) {
        if ("prepared".equals(pending.optString("phase"))
            && String.valueOf(e.getMessage()).contains("PRINT_CLAIM_NOT_CURRENT")) journal.clear();
        else throw e;
      }
      return;
    }
    if (System.currentTimeMillis() - heartbeat > 20000) {
      JSONObject hb =
          (JSONObject)
              api.rpc(
                  "heartbeat_kitchen_print_device",
                  auth(device).put("p_observations", new JSONObject()));
      JSONArray printers = hb.getJSONArray("printers");
      printersReachable = printers.length() > 0;
      printerAttention = false;
      JSONObject obs = new JSONObject();
      for (int i = 0; i < printers.length(); i++) {
        JSONObject p = printers.getJSONObject(i);
        printerAttention |= p.optBoolean("attention");
        boolean reachable = !p.isNull("ip") && tcp.probe(p.getString("ip"), p.getInt("port"));
        printersReachable &= reachable;
        obs.put(p.getString("id"), new JSONObject().put("reachable", reachable));
      }
      api.rpc("heartbeat_kitchen_print_device", auth(device).put("p_observations", obs));
      heartbeat = System.currentTimeMillis();
    }
    Object result = api.rpc("claim_kitchen_printer_job", auth(device));
    if (result == null) {
      set(
          printersReachable && !printerAttention ? "Ready" : "Attention Required",
          printerAttention
              ? "Printing requires attention: check print history and paper output"
              : printersReachable
                  ? "Agent connected; paper output is not confirmed"
                  : "Printer unreachable or not configured. Kitchen orders remain available.");
      return;
    }
    JSONObject claim = (JSONObject) result;
    String attempt = UUID.randomUUID().toString();
    JSONObject record =
        new JSONObject()
            .put("jobId", claim.getString("jobId"))
            .put("claimToken", claim.getString("claimToken"))
            .put("attemptId", attempt)
            .put("phase", "prepared")
            .put("deviceId", device.getString("deviceId"))
            .put("operatorId", api.operator())
            .put("restaurantId", api.restaurant());
    journal.write(record);
    JSONObject begin;
    try {
      begin =
          (JSONObject)
              api.rpc(
                  "begin_kitchen_print_attempt",
                  auth(device)
                      .put("p_job_id", claim.getString("jobId"))
                      .put("p_claim_token", claim.getString("claimToken"))
                      .put("p_attempt_id", attempt)
                      .put("p_config_revision", claim.getLong("configRevision")));
    } catch (Exception e) {
      if (String.valueOf(e.getMessage())
          .matches(
              ".*(PRINT_CONFIG_OR_AUTH_CHANGED|PRINT_LEASE_EXPIRED|PRINT_CLAIM_NOT_CURRENT).*"))
        journal.clear();
      throw e;
    }
    // Consume output authorization durably before any socket operation.
    record.put("phase", "consumed");
    journal.write(record);
    TcpPrinter.Result sent;
    try {
      byte[] bytes = EscPosEncoder.encode(begin.getJSONObject("snapshot"));
      if (!enabled || !foreground || !runGuard.isCurrent(run) || !api.validSession())
        sent = new TcpPrinter.Result("not_sent", "APP_NOT_FOREGROUND");
      else {
        set("Printing", "Sending ticket");
        checkpoint.reached("before_connect");
        sent =
            tcp.send(
                begin.getString("ip"),
                begin.getInt("port"),
                bytes,
                () -> enabled && foreground && runGuard.isCurrent(run) && api.validSession(),
                checkpoint);
      }
    } catch (Exception e) {
      sent = new TcpPrinter.Result("not_sent", "TICKET_VALIDATION_FAILED");
    }
    record
        .put("outcome", sent.outcome)
        .put("errorCode", sent.error == null ? "TCP_TRANSMITTED" : sent.error);
    journal.write(record);
    checkpoint.reached("before_ack");
    String reconciled = acknowledge(device, record);
    set(
        reconciled.equals("transmitted") ? "Ready" : "Attention Required",
        reconciled.equals("transmitted")
            ? "Sent to printer - paper not confirmed"
            : reconciled.equals("uncertain")
                ? "Delivery uncertain; check paper before resolving print history"
                : sent.error);
  }
}
