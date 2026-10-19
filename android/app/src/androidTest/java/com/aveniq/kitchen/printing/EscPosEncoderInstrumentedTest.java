package com.aveniq.kitchen.printing;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class EscPosEncoderInstrumentedTest {
 private JSONObject fixture() throws Exception {try(InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("kitchen-ticket-v1.json")){return new JSONObject(new String(input.readAllBytes(),StandardCharsets.UTF_8));}}
 @Test public void sharedJsonFixtureAndUnicodeRasterHavePinnedDimensions() throws Exception {
  JSONObject input=fixture();byte[] ascii=EscPosEncoder.encode(input);String text=new String(ascii,StandardCharsets.ISO_8859_1);assertTrue(text.contains("04/10/2026 12:30"));assertTrue(text.contains("Size: Large"));assertTrue(text.contains("COPY 2 OF 2"));
  for(boolean large:new boolean[]{false,true}){byte[] raster=EscPosEncoder.raster("寿司 é",large);assertEquals(8+72*(large?64:32),raster.length);assertEquals(29,raster[0]);assertEquals(72,raster[4]);assertEquals(large?64:32,raster[6]);boolean ink=false;for(int i=8;i<raster.length;i++)ink|=raster[i]!=0;assertTrue(ink);}
  assertEquals(8+72*32,EscPosEncoder.raster("é"+"A".repeat(47),false).length);
 }
 @Test public void rejectsInvalidJsonQuantityAndNoControlInjection() throws Exception {
  JSONObject input=fixture();input.getJSONArray("items").getJSONObject(0).put("quantity",1.5);try{EscPosEncoder.encode(input);fail("fraction accepted");}catch(IllegalArgumentException expected){}
  input=fixture();input.put("instructions","\u001b@");try{EscPosEncoder.encode(input);fail("control accepted");}catch(IllegalArgumentException expected){}
 }
}
