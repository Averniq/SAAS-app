package com.aveniq.kitchen.printing;

/** Package-private test seam; no WebView bridge exposes it and release rejects injection. */
interface FaultCheckpoint {
  FaultCheckpoint NONE = point -> {};

  void reached(String point) throws Exception;
}
