package com.aveniq.kitchen.printing;

import static org.junit.Assert.*;

import org.junit.Test;

public class RunGuardTest {
  @Test
  public void previousRunCannotResumeAfterLogoutAndRestart() {
    RunGuard g = new RunGuard();
    long first = g.capture();
    g.invalidate();
    g.invalidate();
    assertFalse(g.isCurrent(first));
    assertTrue(g.isCurrent(g.capture()));
  }
}
