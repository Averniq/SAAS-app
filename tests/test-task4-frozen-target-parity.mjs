#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const hash = value => createHash('sha256').update(value).digest('hex');
const frozen = await readFile(new URL('../evidence/p0-deploy-01-task4-authority-freeze-20260905-v3/files/supabase/migrations/20260817100000_p0_03_authoritative_payment_operations.sql', import.meta.url));
const convergence = await readFile(new URL('../supabase/production-convergence-migrations/20260906000000_p0_deploy_01_task4_payment_convergence.sql', import.meta.url));

assert.equal(hash(convergence.toString().replace(/\r\n/g, '\n').trimEnd()), hash(frozen.toString().replace(/\r\n/g, '\n').trimEnd()), 'Task 4 forward convergence migration must exactly match the verified frozen P0-03 target after transport normalization');
console.log('Task 4 frozen P0-03 target parity: PASS');
