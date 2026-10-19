package com.aveniq.kitchen.printing;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Encoding v1: provisional 48 columns / 576 dots. S300H hardware remains unverified. */
public final class EscPosEncoder {
 public static final int MAX_BYTES=256*1024;
 public record Item(String name,int quantity,List<String> modifiers,String notes) {}
 public record Ticket(String restaurant,String timezone,String order,String table,String createdAt,String destination,List<Item> items,String instructions,int copies,boolean cut,String kind) {}
 public record Line(String text,boolean large) {}
 private EscPosEncoder() {}
 public static byte[] encode(JSONObject snapshot) throws JSONException {
  if(snapshot.toString().getBytes(StandardCharsets.UTF_8).length>MAX_BYTES || exactInt(snapshot,"version")!=1 || !"escpos-80mm-v1".equals(text(snapshot,"profile",true))) throw new IllegalArgumentException("SNAPSHOT_INVALID");
  JSONArray input=snapshot.getJSONArray("items");List<Item> items=new ArrayList<>();
  if(input.length()<1 || input.length()>500)throw new IllegalArgumentException("SNAPSHOT_INVALID");
  for(int i=0;i<input.length();i++) {JSONObject item=input.getJSONObject(i);JSONArray mods=item.getJSONArray("modifiers");if(mods.length()>100)throw new IllegalArgumentException("SNAPSHOT_INVALID");List<String> labels=new ArrayList<>();for(int n=0;n<mods.length();n++){Object mod=mods.get(n);labels.add(mod instanceof String?clean((String)mod,true):text((JSONObject)mod,"groupName",false)+": "+text((JSONObject)mod,"choiceName",true));}items.add(new Item(text(item,"name",true),exactInt(item,"quantity"),labels,text(item,"notes",false)));}
  Object cut=snapshot.get("autoCut");if(!(cut instanceof Boolean))throw new IllegalArgumentException("SNAPSHOT_INVALID");
  return encode(new Ticket(text(snapshot,"restaurantName",true),text(snapshot,"timezone",true),text(snapshot,"orderNumber",true),text(snapshot,"tableLabel",false),text(snapshot,"createdAt",true),text(snapshot,"destination",true),items,text(snapshot,"instructions",false),exactInt(snapshot,"copies"),(Boolean)cut,text(snapshot,"kind",true)));
 }
 private static int exactInt(JSONObject json,String key) throws JSONException {Object value=json.get(key);if(!(value instanceof Number) || ((Number)value).doubleValue()>Integer.MAX_VALUE || ((Number)value).doubleValue()<Integer.MIN_VALUE || ((Number)value).doubleValue()!=Math.rint(((Number)value).doubleValue()))throw new IllegalArgumentException("SNAPSHOT_INVALID_INTEGER");return ((Number)value).intValue();}
 private static String text(JSONObject json,String key,boolean required) throws JSONException {Object value=json.opt(key);if(value==null || value==JSONObject.NULL){if(required)throw new IllegalArgumentException("SNAPSHOT_INVALID_TEXT");return "";}if(!(value instanceof String))throw new IllegalArgumentException("SNAPSHOT_INVALID_TEXT");return clean((String)value,required);}
 public static String clean(String text,boolean required) {
  if(text==null)text=""; for(int i=0;i<text.length();i++){char ch=text.charAt(i);if(Character.isHighSurrogate(ch)){if(i+1>=text.length()||!Character.isLowSurrogate(text.charAt(++i)))throw new IllegalArgumentException("SNAPSHOT_INVALID_TEXT");}else if(Character.isLowSurrogate(ch))throw new IllegalArgumentException("SNAPSHOT_INVALID_TEXT");}
  if(text.length()>MAX_BYTES || text.matches("(?s).*[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f-\\x9f\\u202a-\\u202e\\u2066-\\u2069].*"))throw new IllegalArgumentException("SNAPSHOT_INVALID_TEXT");
  String result=text.replaceAll("[\\r\\n\\t]+"," ").replaceAll(" +"," ").trim();if(required && result.isEmpty())throw new IllegalArgumentException("SNAPSHOT_INVALID_TEXT");return result;
 }
 private static int width(int code) {int type=Character.getType(code);if(type==Character.NON_SPACING_MARK || type==Character.COMBINING_SPACING_MARK || type==Character.ENCLOSING_MARK)return 0;return code>=0x1100&&(code<=0x115f||code==0x2329||code==0x232a||code>=0x2e80&&code<=0xa4cf||code>=0xac00&&code<=0xd7a3||code>=0xf900&&code<=0xfaff||code>=0xfe10&&code<=0xfe6f||code>=0xff00&&code<=0xff60||code>=0x1f000)?2:1;}
 public static List<String> wrap(String text,int columns) {List<String> lines=new ArrayList<>();StringBuilder line=new StringBuilder();int used=0;for(int offset=0;offset<text.length();){int code=text.codePointAt(offset);offset+=Character.charCount(code);int size=width(code);if(used+size>columns){lines.add(line.toString());line.setLength(0);used=0;}line.appendCodePoint(code);used+=size;}if(line.length()>0||lines.isEmpty())lines.add(line.toString());return lines;}
 private static void add(List<Line> lines,String text,boolean large){for(String line:wrap(text,large?24:48))lines.add(new Line(line,large));}
 public static List<Line> layout(Ticket t) {
  if(t==null || t.copies<1 || t.copies>3 || t.items==null || t.items.isEmpty() || t.items.size()>500 || !java.util.Arrays.asList("Kitchen","Bar","Dessert").contains(t.destination) || !java.util.Arrays.asList("automatic","test","reprint").contains(t.kind))throw new IllegalArgumentException("SNAPSHOT_INVALID");
  List<Line> lines=new ArrayList<>();add(lines,clean(t.restaurant,true),false);add(lines,t.destination,false);if(!"automatic".equals(t.kind))add(lines,"test".equals(t.kind)?"*** TEST ONLY ***":"*** REPRINT ***",false);
  add(lines,"ORDER "+clean(t.order,true),true);String table=clean(t.table,false);add(lines,table.isEmpty()?"Table not specified":table,true);
  add(lines,DateTimeFormatter.ofPattern("dd/MM/uuuu HH:mm",Locale.ROOT).withZone(ZoneId.of(t.timezone)).format(java.time.OffsetDateTime.parse(clean(t.createdAt,true),DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant()),false);add(lines,"------------------------------------------------",false);
  for(Item item:t.items){if(item.quantity<1 || item.quantity>99 || item.modifiers==null || item.modifiers.size()>100)throw new IllegalArgumentException("SNAPSHOT_INVALID_ITEM");add(lines,item.quantity+" x "+clean(item.name,true),false);for(String mod:item.modifiers)add(lines,"  "+clean(mod,true),false);String note=clean(item.notes,false);if(!note.isEmpty())add(lines,"  NOTE: "+note,false);}
  String instructions=clean(t.instructions,false);if(!instructions.isEmpty()){add(lines,"------------------------------------------------",false);add(lines,"INSTRUCTIONS: "+instructions,false);}return Collections.unmodifiableList(lines);
 }
 private static void bytes(ByteArrayOutputStream out,byte[] data){if(out.size()+data.length>MAX_BYTES)throw new IllegalArgumentException("PAYLOAD_TOO_LARGE");out.write(data,0,data.length);}
 public static byte[] encode(Ticket ticket) {
  List<Line> lines=layout(ticket);ByteArrayOutputStream out=new ByteArrayOutputStream();
  for(int copy=1;copy<=ticket.copies;copy++){bytes(out,new byte[]{27,64,27,116,0});for(Line line:lines)writeLine(out,line);writeLine(out,new Line("COPY "+copy+" OF "+ticket.copies,false));bytes(out,new byte[]{10,10,10});if(ticket.cut)bytes(out,new byte[]{29,86,0});}
  return out.toByteArray();
 }
 private static void writeLine(ByteArrayOutputStream out,Line line){bytes(out,new byte[]{27,33,(byte)(line.large?48:0)});if(line.text.codePoints().allMatch(code->code>=32&&code<=126)){bytes(out,line.text.getBytes(StandardCharsets.US_ASCII));bytes(out,new byte[]{10});}else{bytes(out,raster(line.text,line.large));}}
 /** Android font fallback is rasterized; unsupported glyphs fail visibly, never '?'. */
 public static byte[] raster(String text,boolean large){
  int height=large?64:32;Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setTypeface(Typeface.create(Typeface.MONOSPACE,large?Typeface.BOLD:Typeface.NORMAL));paint.setTextSize(large?48:24);paint.setColor(Color.BLACK);paint.setTextScaleX((large?24f:12f)/paint.measureText("M"));
  for(int offset=0;offset<text.length();){int code=text.codePointAt(offset);offset+=Character.charCount(code);if(code>126 && Character.getType(code)!=Character.NON_SPACING_MARK && !paint.hasGlyph(new String(Character.toChars(code))))throw new IllegalArgumentException("UNSUPPORTED_GLYPH");}
  int cells=text.codePoints().map(EscPosEncoder::width).sum();if(cells>(large?24:48))throw new IllegalArgumentException("RASTER_LAYOUT_OVERFLOW");
  android.graphics.Rect bounds=new android.graphics.Rect();paint.getTextBounds(text,0,text.length(),bounds);float measured=Math.max(paint.measureText(text),bounds.width());if(measured>576f)paint.setTextScaleX(paint.getTextScaleX()*576f/measured);paint.getTextBounds(text,0,text.length(),bounds);
  Bitmap bitmap=Bitmap.createBitmap(576,height,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.WHITE);canvas.drawText(text,Math.max(0,-bounds.left),-paint.ascent(),paint);
  byte[] result=new byte[8+72*height];result[0]=29;result[1]=118;result[2]=48;result[3]=0;result[4]=72;result[5]=0;result[6]=(byte)(height&255);result[7]=(byte)(height>>8);
  for(int y=0;y<height;y++)for(int x=0;x<576;x++){int pixel=bitmap.getPixel(x,y);if((Color.red(pixel)+Color.green(pixel)+Color.blue(pixel))/3<128)result[8+y*72+x/8]|=(byte)(128>>(x%8));}bitmap.recycle();return result;
 }
}
