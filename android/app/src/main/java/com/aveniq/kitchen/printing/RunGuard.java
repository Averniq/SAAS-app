package com.aveniq.kitchen.printing;

import java.util.concurrent.atomic.AtomicLong;

public final class RunGuard {
  private final AtomicLong generation = new AtomicLong();

  public long capture() {
    return generation.get();
  }

  public void invalidate() {
    generation.incrementAndGet();
  }

  public boolean isCurrent(long run) {
    return generation.get() == run;
  }
}
