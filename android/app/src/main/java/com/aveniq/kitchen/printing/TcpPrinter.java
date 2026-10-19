package com.aveniq.kitchen.printing;
import java.io.IOException;
import java.io.OutputStream;
import java.net.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;

/** Socket completion is transport evidence only; paper is never confirmed here. */
public final class TcpPrinter {
 public record Result(String outcome,String errorCode) {}
 @FunctionalInterface interface Connector {Socket create() throws IOException;}
 private volatile Socket active;private final AtomicLong epoch=new AtomicLong();
 private static final ScheduledExecutorService DEADLINES=Executors.newSingleThreadScheduledExecutor(r->{Thread t=new Thread(r,"kitchen-socket-deadline");t.setDaemon(true);return t;});
 public void cancel(){epoch.incrementAndGet();Socket socket=active;if(socket!=null)try{socket.close();}catch(IOException ignored){}}
 public Result send(LanDestination.Approved destination,byte[] bytes,BooleanSupplier valid){return transfer(()->{Socket socket=new Socket();try{destination.network.bindSocket(socket);return socket;}catch(Exception error){socket.close();throw new IOException("LOCAL_NETWORK_REQUIRED");}},new InetSocketAddress(destination.address,destination.port),bytes,15000,valid);}
 Result transfer(Connector connector,InetSocketAddress destination,byte[] bytes,long timeoutMs,BooleanSupplier valid){
  if(bytes==null||bytes.length==0||bytes.length>EscPosEncoder.MAX_BYTES||timeoutMs<1)return new Result("not_sent","PAYLOAD_TOO_LARGE");long current=epoch.get(),started=System.nanoTime();Socket socket=null;ScheduledFuture<?> timeout=null;boolean writeAttempted=false;
  try{if(!valid.getAsBoolean())return new Result("not_sent","AGENT_STOPPED");socket=connector.create();active=socket;final Socket closing=socket;timeout=DEADLINES.schedule(()->{try{closing.close();}catch(IOException ignored){}},Math.min(timeoutMs,15000),TimeUnit.MILLISECONDS);socket.connect(destination,(int)Math.min(3000,timeoutMs));socket.setTcpNoDelay(true);OutputStream output=socket.getOutputStream();
   for(int offset=0;offset<bytes.length;offset+=4096){if(current!=epoch.get()||!valid.getAsBoolean()||TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started)>=timeoutMs)throw new IOException("AGENT_STOPPED");writeAttempted=true;output.write(bytes,offset,Math.min(4096,bytes.length-offset));}output.flush();if(current!=epoch.get()||!valid.getAsBoolean())throw new IOException("AGENT_STOPPED");return new Result("transmitted",null);
  }catch(SecurityException error){return new Result(writeAttempted?"uncertain":"not_sent","LOCAL_NETWORK_PERMISSION_REQUIRED");}catch(Exception error){String code=error instanceof ConnectException?"CONNECT_REFUSED":error instanceof SocketTimeoutException?"SOCKET_TIMEOUT":current!=epoch.get()||!valid.getAsBoolean()?"AGENT_STOPPED":"TRANSPORT_FAILED";return new Result(writeAttempted?"uncertain":"not_sent",code);
  }finally{if(timeout!=null)timeout.cancel(false);if(socket!=null){try{socket.close();}catch(IOException ignored){}if(active==socket)active=null;}}
 }
 public boolean probe(LanDestination.Approved destination,BooleanSupplier valid){Socket socket=null;ScheduledFuture<?> timeout=null;try{if(!valid.getAsBoolean())return false;socket=new Socket();destination.network.bindSocket(socket);active=socket;Socket closing=socket;timeout=DEADLINES.schedule(()->{try{closing.close();}catch(IOException ignored){}},3,TimeUnit.SECONDS);socket.connect(new InetSocketAddress(destination.address,destination.port),3000);return valid.getAsBoolean();}catch(Exception error){return false;}finally{if(timeout!=null)timeout.cancel(false);if(socket!=null){try{socket.close();}catch(IOException ignored){}if(active==socket)active=null;}}}
}
