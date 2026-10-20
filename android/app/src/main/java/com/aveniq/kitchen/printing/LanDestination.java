package com.aveniq.kitchen.printing;

public final class LanDestination {
  private LanDestination() {}

  public static int address(String ip) {
    if (ip == null || !ip.matches("(0|[1-9][0-9]{0,2})(\\.(0|[1-9][0-9]{0,2})){3}"))
      throw new IllegalArgumentException("PRIVATE_IPV4_REQUIRED");
    String[] p = ip.split("\\.");
    int v = 0;
    for (String s : p) {
      int n = Integer.parseInt(s);
      if (n > 255) throw new IllegalArgumentException("PRIVATE_IPV4_REQUIRED");
      v = (v << 8) | n;
    }
    return v;
  }

  public static void validate(String ip, int port) {
    int v = address(ip);
    int a = (v >>> 24) & 255, b = (v >>> 16) & 255, d = v & 255;
    if (port < 1024
        || port > 65535
        || d == 0
        || d == 255
        || !(a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168)))
      throw new IllegalArgumentException("PRIVATE_LAN_DESTINATION_REQUIRED");
  }

  public static boolean sameSubnet(String target, String local, int prefix) {
    if (prefix < 1 || prefix > 32) return false;
    int mask = (int) (0xffffffffL << (32 - prefix));
    int t = address(target), l = address(local);
    return (t & mask) == (l & mask) && (t & ~mask) != 0 && (t & ~mask) != ~mask;
  }
}
