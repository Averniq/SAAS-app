import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  runLocalGate,
  withLocalGateDatabase,
  cleanupLocalGate,
} from "../scripts/run-local-supabase-integration-gate.mjs";
process.env.AVENIQ_KITCHEN_PRINT_CANDIDATES = "1";
try {
  await runLocalGate();
  await withLocalGateDatabase(async (db) => {
    const query = (input) => {
      const r = spawnSync(
        "docker",
        [
          "exec",
          "-e",
          "PGPASSWORD=postgres",
          "-i",
          db,
          "psql",
          "-X",
          "-qAt",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input, encoding: "utf8" },
      );
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    assert.equal(
      query(
        "select count(*) from pg_tables where schemaname='public' and tablename='kitchen_print_jobs'",
      ),
      "1",
      "Printing candidate must actually be installed in the main Auth/HTTP gate",
    );
    for (const suite of ["access", "dispatch", "delivery"])
      query(
        await readFile("tests/sql/kitchen-printing-" + suite + ".sql", "utf8"),
      );
    assert.equal(
      query(
        "select count(*) from pg_proc where oid in('public.submit_public_qr_order(text,jsonb,text,text,uuid)'::regprocedure,'public.record_authoritative_payment(uuid,uuid,integer,text,text,text,uuid)'::regprocedure)",
      ),
      "2",
    );
    console.log(
      "PASS main canonical Auth/HTTP/financial/Kitchen gate WITH printing candidate and all3 SQL suites",
    );
  });
} finally {
  await cleanupLocalGate();
}
