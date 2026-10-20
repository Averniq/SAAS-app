package com.aveniq.kitchen.printing;

import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.*;

@CapacitorPlugin(name = "KitchenPrint")
public class KitchenPrintPlugin extends Plugin {
  private PrintAgent agent;
  private String loadError;
  private final ExecutorService commands = Executors.newSingleThreadExecutor();

  @Override
  public void load() {
    try {
      agent = new PrintAgent(getContext());
    } catch (Exception e) {
      loadError = "Native printing configuration unavailable";
    }
  }

  private boolean check(PluginCall call) {
    String url = getBridge().getWebView().getUrl();
    if (agent == null) {
      call.reject(loadError == null ? "PRINT_AGENT_UNAVAILABLE" : loadError);
      return false;
    }
    if (url == null || !(url.equals("https://localhost") || url.startsWith("https://localhost/"))) {
      call.reject("LOCAL_APP_ORIGIN_REQUIRED");
      return false;
    }
    return true;
  }

  @PluginMethod
  public void setSession(PluginCall call) {
    if (!check(call)) return;
    agent.session(
        call.getString("accessToken", ""),
        call.getLong("expiresAt", 0L),
        call.getString("operatorId", ""),
        call.getString("restaurantId", ""));
    call.resolve();
  }

  @PluginMethod
  public void beginPairing(PluginCall call) {
    if (!check(call)) return;
    commands.execute(
        () -> {
          try {
            call.resolve(
                JSObject.fromJSONObject(
                    agent.pair(
                        call.getString("restaurantId", ""),
                        call.getString("deviceName", "Kitchen tablet"))));
          } catch (Exception e) {
            call.reject("PAIRING_REQUEST_FAILED: " + e.getMessage());
          }
        });
  }

  @PluginMethod
  public void activatePairing(PluginCall call) {
    if (!check(call)) return;
    commands.execute(
        () -> {
          try {
            agent.activate(call.getString("pairingId", ""));
            call.resolve();
          } catch (Exception e) {
            call.reject("PAIRING_ACTIVATION_FAILED: " + e.getMessage());
          }
        });
  }

  @PluginMethod
  public void start(PluginCall call) {
    if (check(call)) {
      agent.start();
      call.resolve();
    }
  }

  @PluginMethod
  public void stop(PluginCall call) {
    if (check(call)) {
      agent.logout();
      call.resolve();
    }
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    if (!check(call)) return;
    commands.execute(
        () -> {
          try {
            call.resolve(JSObject.fromJSONObject(agent.status()));
          } catch (Exception e) {
            call.reject("PRINT_STATUS_UNAVAILABLE");
          }
        });
  }

  @Override
  protected void handleOnPause() {
    if (agent != null) agent.foreground(false);
  }

  @Override
  protected void handleOnResume() {
    if (agent != null) agent.foreground(true);
  }

  @Override
  protected void handleOnDestroy() {
    if (agent != null) agent.destroy();
    commands.shutdownNow();
  }
}
