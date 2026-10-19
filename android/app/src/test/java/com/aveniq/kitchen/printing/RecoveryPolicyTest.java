package com.aveniq.kitchen.printing;
import org.junit.Test;
import static org.junit.Assert.*;
public class RecoveryPolicyTest {
 @Test public void noRestartStateAuthorizesSocketReplay(){assertEquals(AttemptJournal.Recovery.RECONCILE_BEFORE_BEGIN,AttemptJournal.recoveryFor("before_begin"));assertEquals(AttemptJournal.Recovery.QUARANTINE,AttemptJournal.recoveryFor("consumed"));assertEquals(AttemptJournal.Recovery.ACK_ONLY,AttemptJournal.recoveryFor("outcome"));assertEquals(AttemptJournal.Recovery.ATTENTION,AttemptJournal.recoveryFor("corrupt"));}
}
