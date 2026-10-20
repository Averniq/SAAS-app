package com.aveniq.kitchen.printing;

import static org.junit.Assert.*;

import org.junit.Test;

public class LanDestinationTest {
  @Test
  public void rejectsUnapprovedDestinations() {
    for (String ip :
        new String[] {"127.0.0.1", "169.254.169.254", "8.8.8.8", "010.0.2.2", "printer.local"}) {
      try {
        LanDestination.validate(ip, 9100);
        fail(ip);
      } catch (IllegalArgumentException expected) {
      }
    }
  }

  @Test
  public void privateLiteralAndSubnet() {
    LanDestination.validate("10.0.2.2", 9100);
    assertTrue(LanDestination.sameSubnet("10.0.2.2", "10.0.2.15", 24));
    assertFalse(LanDestination.sameSubnet("192.168.2.2", "192.168.1.2", 24));
  }
}
