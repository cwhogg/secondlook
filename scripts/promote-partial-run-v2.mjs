#!/usr/bin/env node
/**
 * One-shot fix: the 11 Eval cases completed in the stopped 2026-05-27 CLI
 * benchmark were run against the v2 pipeline but stored before
 * scripts/run-benchmark.mjs gained its evalVersion: 'v2' tag. The general
 * v1 backfill then swept them into v1. This script promotes those 11
 * (matched by ppkt_id via the categoryHint field) back to evalVersion: 'v2'.
 *
 * Usage:
 *   BASE_URL=http://localhost:3002 node scripts/promote-partial-run-v2.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
// Only promote rows created at or after this ISO cutoff — the same ppkt_id can
// have older rows from prior benchmark sessions that should remain v1.
const CUTOFF = process.env.CUTOFF || '2026-05-28T00:00:00Z';

const PPKT_IDS = new Set([
  'PMID_36182950_Patient_87',
  'PMID_37349293_Patient_2',
  'PMID_30099644_IV_11',
  'PMID_36662884_P1',
  'PMID_21602930_QT654',
  'PMID_26178382_UAB_R9813_I1',
  'PMID_34101994_III_1',
  'PMID_37598857_Family_8_individual',
  'PMID_35670808_Family_1_A1',
  'PMID_32666529_Family_4_II_1',
  'PMID_25802881_P76',
]);

async function main() {
  console.log(`Promoting partial-run Eval cases via ${BASE_URL}`);

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

  const matched = testCases.filter(
    (tc) =>
      tc.testVersion === 'Eval' &&
      PPKT_IDS.has(tc.categoryHint) &&
      tc.createdAt >= CUTOFF,
  );
  console.log(`  Found ${matched.length} matching testCases at or after ${CUTOFF} (target: ${PPKT_IDS.size})`);
  for (const tc of matched) {
    console.log(`    ${tc.categoryHint} — current evalVersion: ${tc.evalVersion ?? 'unset'} → v2`);
  }

  if (matched.length === 0) {
    console.log('Nothing to promote.');
    return;
  }

  const matchedIds = new Set(matched.map((tc) => tc.id));
  const updated = testCases.map((tc) =>
    matchedIds.has(tc.id) ? { ...tc, evalVersion: 'v2' } : tc,
  );

  const saveRes = await fetch(`${BASE_URL}/api/admin/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testCases: updated }),
  });

  if (!saveRes.ok) {
    console.error(`Save failed: HTTP ${saveRes.status} ${saveRes.statusText}`);
    process.exit(1);
  }

  console.log(`  Promoted ${matched.length} testCases to evalVersion: 'v2'`);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
