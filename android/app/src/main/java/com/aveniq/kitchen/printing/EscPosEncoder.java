package com.aveniq.kitchen.printing;

import android.graphics.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.*;
import java.util.*;
import org.json.*;

public final class EscPosEncoder {
  private static final int LIMIT = 262144;

  private static String safe(String s) {
    if (s.length() > 2000) throw new IllegalArgumentException("TICKET_TEXT_TOO_LONG");
    return s.replaceAll("[\\x00-\\x1f\\x7f-\\x9f]", " ");
  }

  private static void bytes(ByteArrayOutputStream out, int... values) {
    for (int v : values) out.write(v);
  }

  private static void line(ByteArrayOutputStream out, String value, boolean large) {
    String s = safe(value);
    int width = large ? 24 : 48;
    int[] cps = s.codePoints().toArray();
    for (int start = 0; start < Math.max(1, cps.length); start += width) {
      String text = new String(cps, start, Math.min(width, cps.length - start));
      if (text.matches("[\\x20-\\x7e]*")) {
        bytes(out, 29, 33, large ? 17 : 0);
        out.write(text.getBytes(StandardCharsets.US_ASCII), 0, text.length());
        out.write(10);
      } else {
        Bitmap bitmap = Bitmap.createBitmap(576, large ? 64 : 40, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.WHITE);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(Color.BLACK);
        paint.setTextSize(large ? 42 : 24);
        canvas.drawText(text, 0, large ? 49 : 30, paint);
        int h = bitmap.getHeight();
        bytes(out, 29, 118, 48, 0, 72, 0, h & 255, h >> 8);
        for (int y = 0; y < h; y++)
          for (int x = 0; x < 576; x += 8) {
            int b = 0;
            for (int z = 0; z < 8; z++)
              if (Color.red(bitmap.getPixel(x + z, y)) < 128) b |= 128 >> z;
            out.write(b);
          }
        bitmap.recycle();
        out.write(10);
      }
      if (out.size() > LIMIT) throw new IllegalArgumentException("TICKET_TOO_LARGE");
    }
    bytes(out, 29, 33, 0);
  }

  public static byte[] encode(JSONObject s) throws Exception {
    if (s.getInt("version") != 1) throw new IllegalArgumentException("TICKET_VERSION");
    int copies = s.getInt("copies");
    JSONArray items = s.getJSONArray("items");
    if (copies < 1 || copies > 3 || items.length() < 1 || items.length() > 200)
      throw new IllegalArgumentException("INVALID_TICKET");
    String destination = s.getString("destination");
    if (!Arrays.asList("Kitchen", "Bar", "Dessert").contains(destination))
      throw new IllegalArgumentException("INVALID_ROUTE");
    String zone = s.getString("timezone");
    if (!Arrays.asList(TimeZone.getAvailableIDs()).contains(zone))
      throw new IllegalArgumentException("INVALID_TIMEZONE");
    SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.ROOT);
    parser.setLenient(false);
    Date date = parser.parse(s.getString("createdAt").replaceFirst("\\.\\d+", ""));
    SimpleDateFormat clock = new SimpleDateFormat("hh:mm a", Locale.ENGLISH);
    clock.setTimeZone(TimeZone.getTimeZone(zone));
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    for (int copy = 1; copy <= copies; copy++) {
      bytes(out, 27, 64);
      line(out, s.getString("restaurantName"), false);
      if (s.optBoolean("reprint")) line(out, "REPRINT - CHECK FOR DUPLICATE", false);
      line(out, "ORDER #" + s.get("orderNumber"), true);
      line(out, s.optString("tableName", "Table"), true);
      line(out, "TIME: " + clock.format(date), false);
      line(out, "COPY " + copy + " OF " + copies, false);
      line(out, "--------------------------------", false);
      for (int i = 0; i < items.length(); i++) {
        JSONObject item = items.getJSONObject(i);
        int qty = item.getInt("quantity");
        if (qty < 1 || qty > 99) throw new IllegalArgumentException("INVALID_QUANTITY");
        line(out, qty + " x " + item.getString("name"), false);
        JSONArray mods = item.optJSONArray("modifiers");
        if (mods != null)
          for (int j = 0; j < mods.length(); j++)
            line(out, "    " + mods.getJSONObject(j).optString("choiceName"), false);
        if (!item.optString("notes").trim().isEmpty())
          line(out, "    " + item.getString("notes"), false);
      }
      if (!s.optString("instructions").trim().isEmpty())
        line(out, "NOTE: " + s.getString("instructions"), false);
      line(out, "--------------------------------", false);
      line(out, destination.toUpperCase(Locale.ROOT), false);
      bytes(out, 10, 10, 10);
      if (s.optBoolean("autoCut")) bytes(out, 29, 86, 0);
      if (out.size() > LIMIT) throw new IllegalArgumentException("TICKET_TOO_LARGE");
    }
    return out.toByteArray();
  }
}
