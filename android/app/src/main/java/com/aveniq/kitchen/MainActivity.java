package com.aveniq.kitchen;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.aveniq.kitchen.printing.KitchenPrintPlugin;
public class MainActivity extends BridgeActivity {
 @Override protected void onCreate(Bundle savedInstanceState){registerPlugin(KitchenPrintPlugin.class);super.onCreate(savedInstanceState);if(bridge!=null){bridge.getWebView().getSettings().setMixedContentMode(BuildConfig.DEBUG?WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE:WebSettings.MIXED_CONTENT_NEVER_ALLOW);WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);}}
}
