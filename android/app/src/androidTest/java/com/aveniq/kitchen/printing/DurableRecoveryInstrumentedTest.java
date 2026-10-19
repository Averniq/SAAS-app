package com.aveniq.kitchen.printing;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.net.*;
import java.util.UUID;
import java.util.concurrent.*;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class DurableRecoveryInstrumentedTest {
 @Test public void encryptedConsumedJournalRecreatedAfterSocketWriteNeverReconnects()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();String storeName="crash-"+UUID.randomUUID();AttemptJournal journal=new AttemptJournal(new DeviceStore(context,storeName));
  try(ServerSocket server=new ServerSocket(0,1,InetAddress.getByName("127.0.0.1"))){server.setSoTimeout(1500);ExecutorService receiver=Executors.newSingleThreadExecutor();
   Future<byte[]> captured=receiver.submit(()->{try(Socket socket=server.accept()){return socket.getInputStream().readAllBytes();}});
   AttemptEngine.Rpc backend=(name,args)->{
    if(name.equals("begin_kitchen_print_attempt"))return new JSONObject().put("restaurantId","tenant").put("operatorId","operator").put("snapshot",new JSONObject()).put("destination",new JSONObject().put("configRevision",1));
    if(name.equals("inspect_kitchen_print_recovery"))return new JSONObject().put("jobId","job").put("restaurantId","tenant").put("state","dispatching").put("attemptStarted",true);
    if(name.equals("finish_kitchen_print_attempt")){assertEquals("uncertain",args.getString("p_outcome"));return new JSONObject().put("accepted",true).put("outcome","uncertain");}throw new AssertionError(name);
   };
   AttemptEngine.Registration registration=new AttemptEngine.Registration("device","synthetic","tenant","operator");TcpPrinter tcp=new TcpPrinter();byte[] bytes={27,64,84,69,83,84,10};
   AttemptEngine original=new AttemptEngine(backend,journal,(destination,payload)->{assertEquals("transmitted",tcp.transfer(Socket::new,new InetSocketAddress("127.0.0.1",server.getLocalPort()),payload,1000,()->true).outcome());throw new AssertionError("SIMULATED_PROCESS_DEATH");},snapshot->bytes);
   try{original.run(new JSONObject().put("jobId","job").put("claimToken","claim").put("configRevision",1),registration);fail();}catch(AssertionError death){assertEquals("SIMULATED_PROCESS_DEATH",death.getMessage());}
   assertArrayEquals(bytes,captured.get(3,TimeUnit.SECONDS));AttemptJournal recreated=new AttemptJournal(new DeviceStore(context,storeName));assertEquals("consumed",recreated.read().getString("stage"));
   AttemptEngine restarted=new AttemptEngine(backend,recreated,(destination,payload)->{throw new AssertionError("RECOVERY_MUST_NOT_SEND");},snapshot->bytes);
   assertEquals("uncertain",restarted.recover(registration).state());assertNull(recreated.read());assertEquals("idle",restarted.recover(registration).state());
   try(Socket duplicate=server.accept()){fail("second socket opened");}catch(SocketTimeoutException expected){}finally{receiver.shutdownNow();}
  }finally{journal.clear();}
 }
 @Test public void corruptedEncryptedJournalFailsClosed()throws Exception{
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();String name="corrupt-"+UUID.randomUUID();DeviceStore store=new DeviceStore(context,name);store.write(new JSONObject().put("stage","consumed"));
  try(java.io.FileOutputStream file=new java.io.FileOutputStream(new java.io.File(context.getNoBackupFilesDir(),"kp-"+name+".bin"))){file.write(new byte[]{1,12,0});file.getFD().sync();}
  try{new AttemptJournal(new DeviceStore(context,name)).read();fail("corruption silently discarded");}catch(java.io.IOException expected){}finally{store.clear();}
 }
}
