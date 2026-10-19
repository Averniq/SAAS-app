package com.aveniq.kitchen.printing;
import org.junit.Test;
import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
public class EscPosEncoderTest {
 private EscPosEncoder.Ticket ticket(int copies,boolean cut,String notes) {
  return new EscPosEncoder.Ticket("Synthetic Kitchen","Australia/Sydney","12345","Table 8","2026-10-04T01:30:00Z","Kitchen",List.of(new EscPosEncoder.Item("Chicken ramen",2,List.of("Size: Large"),notes)),"No peanuts",copies,cut,"automatic");
 }
 @Test public void copiesAndCutsAreExactAndNoPhysicalSuccessIsImplied() throws Exception {
  for(int copies=1;copies<=3;copies++) { byte[] bytes=EscPosEncoder.encode(ticket(copies,false,"No chilli"));String text=new String(bytes,StandardCharsets.ISO_8859_1);assertTrue(text.contains("04/10/2026 12:30"));assertTrue(text.contains("2 x Chicken ramen"));assertTrue(text.contains("COPY "+copies+" OF "+copies));assertEquals(0,count(bytes,new byte[]{29,86,0}));assertEquals(copies,count(EscPosEncoder.encode(ticket(copies,true,"No chilli")),new byte[]{29,86,0})); }
 }
 @Test public void rejectsInjectedControlBeforeEncoding() { for(String value:List.of("\u001b@","\u001dV","\u0000")) { try {EscPosEncoder.encode(ticket(1,false,value));fail("injection accepted");} catch(IllegalArgumentException expected){} } }
 @Test public void rejectsInvalidCopiesAndOversizedOutput() { for(int copies:List.of(0,4)) {try{EscPosEncoder.encode(ticket(copies,false,""));fail("copies accepted");}catch(IllegalArgumentException expected){}} try{EscPosEncoder.encode(ticket(3,false,"x".repeat(262144)));fail("oversize accepted");}catch(IllegalArgumentException expected){} }
 @Test public void unicodeWrapDoesNotDropText() {String input="寿司 é".repeat(30);assertEquals(input,String.join("",EscPosEncoder.wrap(input,48)));}
 private int count(byte[] bytes,byte[] needle) {int n=0;outer:for(int i=0;i<=bytes.length-needle.length;i++){for(int j=0;j<needle.length;j++)if(bytes[i+j]!=needle[j])continue outer;n++;}return n;}
}
