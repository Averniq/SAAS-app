package com.aveniq.kitchen.printing;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.UUID;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class DeviceStoreInstrumentedTest {
 @Test public void credentialsAreEncryptedNoBackupAndCannotBeCopiedToAnotherKey() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();String id="test-"+UUID.randomUUID();DeviceStore store=new DeviceStore(context,id);String secret="synthetic-secret-"+UUID.randomUUID();store.write(new JSONObject().put("deviceSecret",secret));assertEquals(secret,new DeviceStore(context,id).read().getString("deviceSecret"));
  File source=new File(context.getNoBackupFilesDir(),"kp-"+id+".bin");byte[] bytes;try(FileInputStream in=new FileInputStream(source)){bytes=in.readAllBytes();}assertFalse(new String(bytes,java.nio.charset.StandardCharsets.UTF_8).contains(secret));
  String other=id+"-copy";try(FileOutputStream out=new FileOutputStream(new File(context.getNoBackupFilesDir(),"kp-"+other+".bin"))){out.write(bytes);out.getFD().sync();}try{new DeviceStore(context,other).read();fail("copied credential decrypted");}catch(java.io.IOException expected){}
  assertEquals(0,context.getApplicationInfo().flags & ApplicationInfo.FLAG_ALLOW_BACKUP);store.clear();new DeviceStore(context,other).clear();
 }
 @Test public void durableJournalSurvivesRecreationAndNeverAuthorizesASecondSocket() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();AttemptJournal journal=new AttemptJournal(new DeviceStore(context,"test-journal-"+UUID.randomUUID()));JSONObject entry=new JSONObject().put("stage","before_begin").put("attemptId",UUID.randomUUID().toString());journal.save(entry);journal.save(entry.put("stage","consumed"));assertEquals("consumed",journal.read().getString("stage"));assertEquals(AttemptJournal.Recovery.QUARANTINE,AttemptJournal.recoveryFor("consumed"));assertEquals(AttemptJournal.Recovery.ACK_ONLY,AttemptJournal.recoveryFor("outcome"));journal.clear();
 }
}
