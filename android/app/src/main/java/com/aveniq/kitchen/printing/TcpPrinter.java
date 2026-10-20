package com.aveniq.kitchen.printing;

import android.content.Context;
import android.net.*;
import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public final class TcpPrinter {
  public static final class Result {
    public final String outcome, error;

    Result(String o, String e) {
      outcome = o;
      error = e;
    }
  }

  private final ConnectivityManager connectivity;
  private volatile Socket current;

  public TcpPrinter(Context c) {
    connectivity = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
  }

  private Network network(String ip) throws Exception {
    Network n = connectivity.getActiveNetwork();
    NetworkCapabilities caps = connectivity.getNetworkCapabilities(n);
    if (n == null
        || caps == null
        || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        || !(caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
            || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)))
      throw new IOException("WIFI_OR_ETHERNET_REQUIRED");
    LinkProperties links = connectivity.getLinkProperties(n);
    if (links == null) throw new IOException("NETWORK_UNAVAILABLE");
    for (LinkAddress a : links.getLinkAddresses())
      if (a.getAddress() instanceof Inet4Address
          && LanDestination.sameSubnet(ip, a.getAddress().getHostAddress(), a.getPrefixLength()))
        return n;
    throw new IOException("PRINTER_NOT_ON_APPROVED_SUBNET");
  }

  public boolean probe(String ip, int port) {
    try {
      LanDestination.validate(ip, port);
      Network n = network(ip);
      try (Socket s = new Socket()) {
        n.bindSocket(s);
        s.connect(new InetSocketAddress(ip, port), 1500);
        return true;
      }
    } catch (Exception e) {
      return false;
    }
  }

  public Result send(String ip, int port, byte[] bytes) {
    return send(ip, port, bytes, () -> true);
  }

  public Result send(
      String ip, int port, byte[] bytes, java.util.function.BooleanSupplier allowed) {
    boolean writing = false;
    ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor();
    Socket socket = new Socket();
    current = socket;
    try {
      if (!allowed.getAsBoolean()) return new Result("not_sent", "PRINT_RUN_CANCELLED");
      LanDestination.validate(ip, port);
      Network n = network(ip);
      n.bindSocket(socket);
      timer.schedule(
          () -> {
            try {
              socket.close();
            } catch (Exception ignored) {
            }
          },
          15,
          TimeUnit.SECONDS);
      socket.connect(new InetSocketAddress(ip, port), 3000);
      if (!allowed.getAsBoolean()) return new Result("not_sent", "PRINT_RUN_CANCELLED");
      writing = true;
      socket.getOutputStream().write(bytes);
      socket.getOutputStream().flush();
      return new Result("transmitted", null);
    } catch (Exception e) {
      return new Result(
          writing ? "uncertain" : "not_sent",
          writing ? "SOCKET_WRITE_AMBIGUOUS" : "CONNECT_FAILED");
    } finally {
      try {
        socket.close();
      } catch (Exception ignored) {
      }
      current = null;
      timer.shutdownNow();
    }
  }

  public void cancel() {
    Socket s = current;
    if (s != null)
      try {
        s.close();
      } catch (Exception ignored) {
      }
  }
}
