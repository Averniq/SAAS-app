package com.aveniq.kitchen.printing;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

public final class PrintApi {
  private final String origin, key;
  private volatile String token = "", operator = "", restaurant = "";
  private volatile long expires;

  public PrintApi(Context context) throws Exception {
    JSONObject config;
    try (InputStream in = context.getAssets().open("kitchen-backend.json")) {
      config = new JSONObject(new String(readAsset(in), StandardCharsets.UTF_8));
    }
    origin = config.getString("url").replaceAll("/+$", "");
    key = config.getString("publishableKey");
    URI uri = URI.create(origin);
    boolean debug = (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    if (uri.getUserInfo() != null
        || uri.getQuery() != null
        || uri.getFragment() != null
        || !uri.getPath().isEmpty()) throw new IllegalArgumentException("INVALID_API_ORIGIN");
    if (!"https".equals(uri.getScheme())
        && !(debug && "http".equals(uri.getScheme()) && "10.0.2.2".equals(uri.getHost())))
      throw new IllegalArgumentException("TLS_API_REQUIRED");
  }

  private static byte[] readAsset(InputStream in) throws IOException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] b = new byte[4096];
    int n;
    while ((n = in.read(b)) >= 0) {
      out.write(b, 0, n);
      if (out.size() > 16384) throw new IOException("CONFIG_TOO_LARGE");
    }
    return out.toByteArray();
  }

  public synchronized void session(String jwt, long expiry, String uid, String rid) {
    token = jwt;
    expires = expiry;
    operator = uid;
    restaurant = rid;
  }

  public void clear() {
    session("", 0, "", "");
  }

  public boolean validSession() {
    return !token.isEmpty() && expires > System.currentTimeMillis() / 1000 + 5;
  }

  public String operator() {
    return operator;
  }

  public String restaurant() {
    return restaurant;
  }

  public Object rpc(String name, JSONObject body) throws Exception {
    if (token.isEmpty() || expires <= System.currentTimeMillis() / 1000 + 5)
      throw new IOException("STAFF_SIGN_IN_REQUIRED");
    if (!name.matches("[a-z_]+")) throw new IllegalArgumentException("RPC_NAME");
    HttpURLConnection c =
        (HttpURLConnection) new URL(origin + "/rest/v1/rpc/" + name).openConnection();
    c.setInstanceFollowRedirects(false);
    c.setConnectTimeout(5000);
    c.setReadTimeout(10000);
    c.setRequestMethod("POST");
    c.setDoOutput(true);
    c.setRequestProperty("Content-Type", "application/json");
    c.setRequestProperty("apikey", key);
    c.setRequestProperty("Authorization", "Bearer " + token);
    try {
      try (OutputStream out = c.getOutputStream()) {
        out.write(body.toString().getBytes(StandardCharsets.UTF_8));
      }
      int status = c.getResponseCode();
      InputStream stream = status >= 200 && status < 300 ? c.getInputStream() : c.getErrorStream();
      String text = "";
      if (stream != null)
        try (InputStream in = stream;
            ByteArrayOutputStream out = new ByteArrayOutputStream()) {
          byte[] b = new byte[4096];
          int n;
          while ((n = in.read(b)) >= 0) {
            out.write(b, 0, n);
            if (out.size() > 1048576) throw new IOException("API_RESPONSE_TOO_LARGE");
          }
          text = new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
      if (status < 200 || status >= 300) {
        String code = "API_REQUEST_FAILED";
        try {
          code = new JSONObject(text).optString("message", code);
        } catch (Exception ignored) {
        }
        if (status == 401) code = "STAFF_SIGN_IN_REQUIRED";
        throw new IOException(code);
      }
      Object value = new JSONTokener(text).nextValue();
      return value == JSONObject.NULL ? null : value;
    } finally {
      c.disconnect();
    }
  }
}
