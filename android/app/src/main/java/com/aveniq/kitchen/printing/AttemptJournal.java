package com.aveniq.kitchen.printing;
import org.json.JSONObject;
import java.io.IOException;
/** One outstanding attempt. Recovery never returns a SEND action. */
public final class AttemptJournal implements AttemptEngine.Journal {
 public enum Recovery { RECONCILE_BEFORE_BEGIN,QUARANTINE,ACK_ONLY,ATTENTION }
 private final DeviceStore store;
 public AttemptJournal(DeviceStore store){this.store=store;}
 public JSONObject read() throws IOException{return store.read();}
 public void save(JSONObject entry) throws IOException{if(recoveryFor(entry.optString("stage",""))==Recovery.ATTENTION)throw new IOException("JOURNAL_STAGE_INVALID");store.write(entry);}
 public void clear(){store.clear();}
 public static Recovery recoveryFor(String stage){if("before_begin".equals(stage))return Recovery.RECONCILE_BEFORE_BEGIN;if("consumed".equals(stage))return Recovery.QUARANTINE;if("outcome".equals(stage))return Recovery.ACK_ONLY;return Recovery.ATTENTION;}
}
