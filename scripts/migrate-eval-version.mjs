#!/usr/bin/env node
/**
 * One-shot migration: tag every existing testVersion: 'Eval' test case that
 * has no evalVersion as evalVersion: 'v1' (i.e. produced by the pre-2026-05-27
 * pipeline). Idempotent — already-tagged cases are left alone.
 *
 * Usage:
 *   node scripts/migrate-eval-version.mjs              # against http://localhost:3000
 *   BASE_URL=http://localhost:3002 node scripts/migrate-eval-version.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function main() {
  console.log(`Migrating Eval testCases via ${BASE_URL}`);

  const res = await fetch(`${BASE_URL}/api/admin/test-cases`);
  if (!res.ok) {
    console.error(`Failed to load test cases: HTTP ${res.status}`);
    process.exit(1);
  }
  const { testCases } = await res.json();
  if (!Array.isArray(testCases)) {
    console.error('Bad response shape: expected { testCases: [] }');
    process.exit(1);
  }

  const evalCases = testCases.filter((tc) => tc.testVersion === 'Eval');
  const unTagged = evalCases.filter((tc) => !tc.evalVersion);
  console.log(`  ${testCases.length} total testCases, ${evalCases.length} are Eval, ${unTagged.length} need backfill`);

  if (unTagged.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  const migrated = testCases.map((tc) =>
    tc.testVersion === 'Eval' && !tc.evalVersion
      ? { ...tc, evalVersion: 'v1' }
      : tc,
  );

  const saveRes = await fetch(`${BASE_URL}/api/admin/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testCases: migrated }),
  });

  if (!saveRes.ok) {
    console.error(`Save failed: HTTP ${saveRes.status} ${saveRes.statusText}`);
    process.exit(1);
  }

  console.log(`  Tagged ${unTagged.length} testCases as evalVersion: 'v1'`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
