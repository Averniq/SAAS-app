package com.aveniq.kitchen.printing;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;
public class TcpPrinterTest {
 @Test public void exactBytesReachRealLoopbackSocketWithoutClaimingPaper() throws Exception {
  try(ServerSocket server=new ServerSocket(0,1,InetAddress.getLoopbackAddress())){ExecutorService reader=Executors.newSingleThreadExecutor();try{Future<byte[]> captured=reader.submit(()->{try(Socket socket=server.accept()){return socket.getInputStream().readAllBytes();}});byte[] payload="synthetic ESC/POS bytes".getBytes(java.nio.charset.StandardCharsets.US_ASCII);TcpPrinter transport=new TcpPrinter();TcpPrinter.Result result=transport.transfer(Socket::new,new InetSocketAddress("127.0.0.1",server.getLocalPort()),payload,2000,()->true);assertEquals("transmitted",result.outcome());assertArrayEquals(payload,captured.get(3,TimeUnit.SECONDS));}finally{reader.shutdownNow();}}
 }
 @Test public void refusalBeforeWriteIsNotSent() throws Exception {int port;try(ServerSocket socket=new ServerSocket(0)){port=socket.getLocalPort();}TcpPrinter.Result result=new TcpPrinter().transfer(Socket::new,new InetSocketAddress("127.0.0.1",port),new byte[]{1},1000,()->true);assertEquals("not_sent",result.outcome());}
 @Test public void anyWriteAttemptFailureIsUncertain(){Socket socket=new Socket(){@Override public void connect(SocketAddress address,int timeout){}@Override public OutputStream getOutputStream(){return new OutputStream(){@Override public void write(int value)throws IOException{throw new IOException("synthetic partial write");}@Override public void write(byte[] bytes,int off,int len)throws IOException{throw new IOException("synthetic partial write");}};}};assertEquals("uncertain",new TcpPrinter().transfer(()->socket,new InetSocketAddress("127.0.0.1",9100),new byte[]{1,2,3},1000,()->true).outcome());}
 @Test public void cancellationBeforeConnectDoesNotWrite(){assertEquals("not_sent",new TcpPrinter().transfer(Socket::new,new InetSocketAddress("127.0.0.1",9100),new byte[]{1},1000,()->false).outcome());}
}
