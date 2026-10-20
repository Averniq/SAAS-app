package com.aveniq.kitchen.printing;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.Process;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Host runner force-stops the real app process at a durable, test-only checkpoint. */
@RunWith(AndroidJUnit4.class)
public class FaultInjectionInstrumentedTest {
  private final android.os.Bundle args = InstrumentationRegistry.getArguments();

  private Context context() {
    return InstrumentationRegistry.getInstrumentation().getTargetContext();
  }

  private PrintApi api() throws Exception {
    PrintApi api = new PrintApi(context());
    api.session(
        args.getString("staffJwt"),
        Long.parseLong(args.getString("expiresAt")),
        args.getString("operatorId"),
        args.getString("restaurantId"));
    return api;
  }

  private void session(PrintAgent agent) {
    agent.session(
        args.getString("staffJwt"),
        Long.parseLong(args.getString("expiresAt")),
        args.getString("operatorId"),
        args.getString("restaurantId"));
  }

  private JSONObject job() throws Exception {
    JSONArray history =
        (JSONArray)
            api()
                .rpc(
                    "list_kitchen_print_history",
                    new JSONObject()
                        .put("p_restaurant_id", args.getString("restaurantId"))
                        .put("p_limit", 50));
    for (int i = 0; i < history.length(); i++)
      if (history.getJSONObject(i).getString("id").equals(args.getString("jobId")))
        return history.getJSONObject(i);
    throw new AssertionError("Fixture job missing");
  }

  @Test
  public void crashAtCheckpoint() throws Exception {
    String requested = args.getString("checkpoint");
    FaultCheckpoint hook =
        point -> {
          if (!point.equals(requested)) return;
          JSONObject pending = new AttemptJournal(new DeviceStore(context())).pending();
          JSONObject evidence =
              new JSONObject()
                  .put("point", point)
                  .put("pid", Process.myPid())
                  .put("phase", pending.optString("phase"))
                  .put("outcome", pending.optString("outcome"));
          Files.write(
              new File(context().getFilesDir(), "fault-checkpoint.json").toPath(),
              evidence.toString().getBytes(StandardCharsets.UTF_8));
          while (true)
            Thread.sleep(
                1000); // host force-stop must terminate this process; never returns success
        };
    PrintAgent agent = new PrintAgent(context(), hook);
    session(agent);
    JSONObject pair = agent.pair(args.getString("restaurantId"), "FAULT SYNTHETIC EMULATOR");
    api()
        .rpc(
            "approve_kitchen_print_pairing",
            new JSONObject()
                .put("p_pairing_id", pair.getString("id"))
                .put("p_printer_ids", new JSONArray().put(args.getString("printerId"))));
    agent.activate(pair.getString("id"));
    new File(context().getFilesDir(), "fault-checkpoint.json").delete();
    agent.start();
    for (int i = 0; i < 60; i++) Thread.sleep(1000);
    agent.destroy();
    fail("Expected host to terminate the process at checkpoint");
  }

  @Test
  public void recoverWithoutReprinting() throws Exception {
    JSONObject before = new AttemptJournal(new DeviceStore(context())).pending();
    assertNotNull("Killed process must leave durable journal", before);
    PrintAgent agent = new PrintAgent(context());
    session(agent);
    agent.start();
    String expected = args.getString("expectedState");
    boolean recovered = false;
    for (int i = 0; i < 30; i++) {
      Thread.sleep(500);
      if (job().getString("state").equals(expected)
          && new AttemptJournal(new DeviceStore(context())).pending() == null) {
        recovered = true;
        break;
      }
    }
    assertTrue("Recovered journal must reconcile without resending bytes", recovered);
    if ("uncertain".equals(expected))
      assertEquals("Attention Required", agent.status().getString("state"));
    Thread.sleep(8500); // at least two further worker polls: uncertain job must stay quarantined
    agent.destroy();
    JSONObject after = job();
    assertEquals(expected, after.getString("state"));
    assertEquals(1, after.getInt("attempt_count"));
  }

  @Test
  public void lostAcknowledgement() throws Exception {
    PrintAgent agent = new PrintAgent(context());
    session(agent);
    JSONObject pair = agent.pair(args.getString("restaurantId"), "ACK LOSS EMULATOR");
    api()
        .rpc(
            "approve_kitchen_print_pairing",
            new JSONObject()
                .put("p_pairing_id", pair.getString("id"))
                .put("p_printer_ids", new JSONArray().put(args.getString("printerId"))));
    agent.activate(pair.getString("id"));
    agent.start();
    boolean recovered = false;
    for (int i = 0; i < 50; i++) {
      Thread.sleep(500);
      if (job().getString("state").equals("transmitted")
          && new AttemptJournal(new DeviceStore(context())).pending() == null) {
        recovered = true;
        break;
      }
    }
    agent.destroy();
    assertTrue("Lost real HTTP response must reconcile idempotently", recovered);
    assertEquals(1, job().getInt("attempt_count"));
  }
}
