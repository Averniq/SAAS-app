package com.aveniq.kitchen.printing;

import static org.junit.Assert.*;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.*;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PrintingInstrumentedTest {
  private JSONObject snapshot() throws Exception {
    return new JSONObject(
        "{\"version\":1,\"restaurantName\":\"SYNTHETIC\",\"timezone\":\"Australia/Sydney\",\"orderNumber\":1024,\"tableName\":\"Table"
            + " 5\",\"createdAt\":\"2026-10-20T01:35:00Z\",\"destination\":\"Kitchen\",\"copies\":2,\"autoCut\":true,\"items\":[{\"name\":\"WAGYU\",\"quantity\":2,\"notes\":\"No"
            + " onion\",\"modifiers\":[]}]}");
  }

  @Test
  public void releaseContextRejectsFaultInjection() throws Exception {
    var actual = InstrumentationRegistry.getInstrumentation().getTargetContext();
    var release =
        new android.content.ContextWrapper(actual) {
          @Override
          public android.content.pm.ApplicationInfo getApplicationInfo() {
            var info = new android.content.pm.ApplicationInfo(super.getApplicationInfo());
            info.flags &= ~android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE;
            return info;
          }
        };
    try {
      new PrintAgent(release, point -> {});
      fail("Release context accepted fault injection");
    } catch (SecurityException expected) {
      assertEquals("DEBUG_FAULT_INJECTION_ONLY", expected.getMessage());
    }
  }

  @Test
  public void encoderCopiesCutAndUnicode() throws Exception {
    byte[] data = EscPosEncoder.encode(snapshot());
    String text = new String(data, java.nio.charset.StandardCharsets.US_ASCII);
    assertTrue(text.contains("ORDER #1024"));
    assertTrue(text.contains("No onion"));
    int cuts = 0;
    for (int i = 0; i < data.length - 2; i++) if (data[i] == 29 && data[i + 1] == 86) cuts++;
    assertEquals(2, cuts);
    JSONObject s = snapshot();
    s.put("autoCut", false);
    s.getJSONArray("items").getJSONObject(0).put("name", "和牛");
    assertTrue(EscPosEncoder.encode(s).length > data.length);
  }

  @Test
  public void journalSurvivesNewStoreInstance() throws Exception {
    var context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    DeviceStore a = new DeviceStore(context);
    a.save("test-entry", new JSONObject().put("attempt", "stable"));
    DeviceStore b = new DeviceStore(context);
    assertEquals("stable", b.load("test-entry").getString("attempt"));
    a.remove("test-entry");
  }

  @Test
  public void simulatorReceivesNativeTcpBytes() throws Exception {
    var args = InstrumentationRegistry.getArguments();
    String host = args.getString("printerHost");
    assertNotNull("Pass printerHost for a real emulator TCP test", host);
    byte[] data = EscPosEncoder.encode(snapshot());
    var context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    TcpPrinter tcp = new TcpPrinter(context);
    assertEquals("transmitted", tcp.send(host, 19140, data).outcome);
  }

  @Test
  public void pairedNativeAgentPrintsQueuedOrderAndDoesNotReplayOnRestart() throws Exception {
    var args = InstrumentationRegistry.getArguments();
    String jwt = args.getString("staffJwt"),
        rid = args.getString("restaurantId"),
        uid = args.getString("operatorId"),
        printer = args.getString("printerId"),
        job = args.getString("jobId");
    assertNotNull("Local synthetic staff JWT required", jwt);
    var context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    long expiry = Long.parseLong(args.getString("expiresAt"));
    PrintApi api = new PrintApi(context);
    api.session(jwt, expiry, uid, rid);
    PrintAgent agent = new PrintAgent(context);
    agent.session(jwt, expiry, uid, rid);
    JSONObject pair = agent.pair(rid, "API36 instrumented tablet");
    api.rpc(
        "approve_kitchen_print_pairing",
        new JSONObject()
            .put("p_pairing_id", pair.getString("id"))
            .put("p_printer_ids", new JSONArray().put(printer)));
    agent.activate(pair.getString("id"));
    agent.start();
    boolean sent = false;
    for (int i = 0; i < 40; i++) {
      Thread.sleep(1000);
      JSONArray rows =
          (JSONArray)
              api.rpc(
                  "list_kitchen_print_history",
                  new JSONObject()
                      .put("p_restaurant_id", rid)
                      .put("p_before", JSONObject.NULL)
                      .put("p_before_id", JSONObject.NULL)
                      .put("p_limit", 50));
      for (int n = 0; n < rows.length(); n++) {
        JSONObject row = rows.getJSONObject(n);
        if (row.getString("id").equals(job) && row.getString("state").equals("transmitted"))
          sent = true;
      }
      if (sent) break;
    }
    agent.destroy();
    assertTrue("Queued synthetic QR order must be transmitted by actual native agent", sent);
    PrintAgent restarted = new PrintAgent(context);
    restarted.session(jwt, expiry, uid, rid);
    restarted.start();
    Thread.sleep(6000);
    restarted.destroy();
    JSONArray rows =
        (JSONArray)
            api.rpc(
                "list_kitchen_print_history",
                new JSONObject()
                    .put("p_restaurant_id", rid)
                    .put("p_before", JSONObject.NULL)
                    .put("p_before_id", JSONObject.NULL)
                    .put("p_limit", 50));
    boolean verified = false;
    for (int n = 0; n < rows.length(); n++) {
      JSONObject row = rows.getJSONObject(n);
      if (row.getString("id").equals(job)) {
        assertEquals("transmitted", row.getString("state"));
        assertEquals("Restart must not reclaim transmitted job", 1, row.getInt("attempt_count"));
        verified = true;
      }
    }
    assertTrue(verified);
  }

  @Test
  public void debugWebViewCanReachLocalAuth() throws Exception {
    java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);
    java.util.concurrent.atomic.AtomicReference<String> result =
        new java.util.concurrent.atomic.AtomicReference<>();
    JSONObject config;
    try (java.io.InputStream in =
        InstrumentationRegistry.getInstrumentation()
            .getTargetContext()
            .getAssets()
            .open("kitchen-backend.json")) {
      config =
          new JSONObject(new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
    }
    String script =
        "window.__kitchenTestResult='WAITING';fetch("
            + JSONObject.quote(config.getString("url") + "/auth/v1/health")
            + ",{headers:{apikey:"
            + JSONObject.quote(config.getString("publishableKey"))
            + "}}).then(r=>window.__kitchenTestResult=String(r.status)).catch(()=>window.__kitchenTestResult='NETWORK_ERROR')";
    try (androidx.test.core.app.ActivityScenario<com.aveniq.kitchen.MainActivity> scenario =
        androidx.test.core.app.ActivityScenario.launch(com.aveniq.kitchen.MainActivity.class)) {
      Thread.sleep(3000);
      scenario.onActivity(
          activity -> {
            android.webkit.WebView web = activity.getBridge().getWebView();
            web.evaluateJavascript(script, null);
          });
      for (int i = 0; i < 30; i++) {
        Thread.sleep(500);
        scenario.onActivity(
            a ->
                a.getBridge()
                    .getWebView()
                    .evaluateJavascript("window.__kitchenTestResult", result::set));
        if (JSONObject.quote("200").equals(result.get())
            || JSONObject.quote("NETWORK_ERROR").equals(result.get())) break;
      }
      assertEquals(JSONObject.quote("200"), result.get());
    }
  }
}
