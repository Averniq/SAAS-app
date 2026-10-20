package com.aveniq.kitchen.printing;

import org.json.JSONObject;

public final class AttemptJournal {
  private final DeviceStore store;

  public AttemptJournal(DeviceStore store) {
    this.store = store;
  }

  public JSONObject pending() throws Exception {
    return store.load("attempt");
  }

  public void write(JSONObject record) throws Exception {
    store.save("attempt", record);
  }

  public void archivePending() throws Exception {
    JSONObject pending = pending();
    if (pending == null) return;
    JSONObject archive = store.load("orphan-attempts");
    if (archive == null) archive = new JSONObject().put("entries", new org.json.JSONArray());
    org.json.JSONArray entries = archive.getJSONArray("entries");
    if (entries.length() >= 100)
      throw new IllegalStateException("ARCHIVED_PRINT_ATTEMPTS_REQUIRE_SUPPORT");
    entries.put(pending);
    store.save("orphan-attempts", archive);
    clear();
  }

  public void clear() {
    store.remove("attempt");
  }
}
