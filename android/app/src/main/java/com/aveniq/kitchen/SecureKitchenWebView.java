package com.aveniq.kitchen;
import android.content.Context;
import android.util.AttributeSet;
/** Refuse every legacy interface; only Capacitor's modern main-frame bridge is supported. */
public final class SecureKitchenWebView extends com.getcapacitor.CapacitorWebView {
 private boolean legacyBridgeBlocked;
 private java.util.Set<String> blockedInterfaces;
 public SecureKitchenWebView(Context context,AttributeSet attributes){super(context,attributes);}
 @Override public void addJavascriptInterface(Object object,String name){
  if(blockedInterfaces==null)blockedInterfaces=new java.util.LinkedHashSet<>();
  blockedInterfaces.add(name);
  if("androidBridge".equals(name))legacyBridgeBlocked=true;
  // Never forward any legacy interface to the WebView, including unrelated framework helpers.
 }
 public boolean legacyBridgeBlocked(){return legacyBridgeBlocked;}
 public java.util.Set<String> blockedInterfaceNames(){return blockedInterfaces==null?java.util.Collections.emptySet():java.util.Collections.unmodifiableSet(blockedInterfaces);}
}
