package com.aveniq.kitchen;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebSettings;
import com.aveniq.kitchen.printing.KitchenPrintPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(KitchenPrintPlugin.class);
    super.onCreate(savedInstanceState);
    // Debug builds can reach only the isolated HTTP host allowed by debug network-security XML.
    // Release retains Capacitor's TLS-only mixed-content policy.
    if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0)
      getBridge()
          .getWebView()
          .getSettings()
          .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
  }
}
