# /eval persistence — handoff for fresh session

Status as of 2026-05-28 morning. The /eval page persists initial state but loses every subsequent update. Production blob has 3 v3 cases stuck at `status: 'generated'`. Hard-refresh wipes them from the UI even though they remain (partially) in storage.

## What works
- The full SecondLook V2 pipeline (no change tonight).
- The `/api/admin/eval-baseline` endpoint exists (commit `325478d`) and dispatches to either OpenAI `o3` (reasoning high) or Anthropic `claude-opus-4-7`. `maxDuration = 300` was added in `162a432`.
- `/api/admin/test-cases` accepts `{ upsert, deleteIds }` for partial merges and `{ testCases: [...] }` for full replace. CDN cache bypass on the merge read in commit `a6df0b9` (verified working via curl probe).
- /eval page has SecondLook / OpenAI / Claude tabs with per-tab history filter, per-tab "already run" count, save-failed banner showing payload size + upsert count.
- /testing default `testVersion` is `v15`. Run New Test card lives inside the StatsBanner.

## The bug
Production blob (`https://secondlook.vercel.app/api/admin/test-cases`):

```
Total testCases: 650
Eval: 336 (v1: 322, v2: 11, v3: 3)
v3 cases status breakdown:
  2026-05-28T14:56:39Z | generated | NO grading | Sulfite oxidase deficiency
  2026-05-28T14:32:09Z | generated | NO grading | Holt-Oram syndrome
  2026-05-28T14:26:26Z | generated | NO grading | Epilepsy, early-onset, 3, ...
```

Every v3 run made it to `status: 'generated'` (the initial create via `upsertCase`) and then **stopped persisting** through the rest of its lifecycle (`running` → `extractedSymptoms` → `completed` → `graded`). The UI showed a fully graded v3 case before refresh; after refresh the blob says `generated` and the Version Summary computes 0/0/0 for v3 because `computeStats()` filters to `status === 'graded'`.

## Root cause (high confidence)
In `app/eval/page.tsx` and `app/testing/page.tsx` (commit `37893b8`):

```tsx
const patchCase = useCallback((id, patch) => {
  let updated: TestCase | null = null
  setTestCases((prev) => {
    const current = prev.find((t) => t.id === id)
    if (!current) return prev
    updated = { ...current, ...patch }
    return prev.map((t) => (t.id === id ? updated! : t))
  })
  if (updated) upsertTestCases([updated])   // ← this often runs BEFORE the updater
}, [])
```

React 18+ does not run the setState updater synchronously inside `setTestCases(...)`. The updater is queued and invoked during the next render. By the time control returns to the line `if (updated)`, `updated` is still `null` for normal-priority state updates. So `upsertTestCases([updated])` never fires from `patchCase`. Only `upsertCase` works, because it has a concrete `tc` parameter that's not gated on the updater running.

`removeCaseById` (`setTestCases(prev => prev.filter(...))` + `deleteTestCases([id])`) is fine — it doesn't depend on a captured closure value.

## Recommended fix
Maintain a synchronous mirror of testCases in a ref and mutate it inside the helpers. setTestCases becomes a pure display sync; the save uses the ref-derived `updated` value.

```tsx
const testCasesRef = useRef<TestCase[]>([])

useEffect(() => {
  loadTestCases().then((loaded) => {
    testCasesRef.current = loaded
    setTestCases(loaded)
  })
}, [])

const upsertCase = useCallback((tc: TestCase) => {
  const cur = testCasesRef.current
  const idx = cur.findIndex(t => t.id === tc.id)
  const next = idx === -1 ? [tc, ...cur] : cur.map(t => t.id === tc.id ? tc : t)
  testCasesRef.current = next
  setTestCases(next)
  upsertTestCases([tc])
}, [])

const patchCase = useCallback((id: string, patch: Partial<TestCase>) => {
  const cur = testCasesRef.current.find(t => t.id === id)
  if (!cur) return
  const updated = { ...cur, ...patch }
  const next = testCasesRef.current.map(t => t.id === id ? updated : t)
  testCasesRef.current = next
  setTestCases(next)
  upsertTestCases([updated])
}, [])

const removeCaseById = useCallback((id: string) => {
  const next = testCasesRef.current.filter(t => t.id !== id)
  testCasesRef.current = next
  setTestCases(next)
  deleteTestCases([id])
}, [])
```

Notes:
- The ref is written **before** `setTestCases`, so the save uses the latest value regardless of React's scheduling.
- Apply identically to `/app/testing/page.tsx`.
- Cross-check by adding a temporary `console.log('patchCase fires', id, patch)` and `console.log('upsertTestCases called', cases.map(c=>c.id))` in both files; the second line should appear N+1 times for a single run, not once.

## Verification protocol
1. Hard-refresh `/eval` after deploy. State loads from blob.
2. Open DevTools console.
3. Run **one** SecondLook eval.
4. Watch the Network tab: expect ~5 sequential `POST /api/admin/test-cases` calls (generated → running → extractedSymptoms set → completed → graded). Each ≤100 KB.
5. After grading, hard-refresh. The case must show as `graded` in the history list. The Version Summary must include a `v3` row.
6. Repeat on OpenAI tab (1 case), Claude tab (1 case). Each baseline call takes 30-90s due to `o3`/`opus-4-7` latency.

## What was tried tonight (chronological)
- `c8b0362`: Switched the test-cases POST from full-array (~28 MB) to `{ upsert, deleteIds }` deltas. Vercel's 4.5 MB request limit was rejecting full saves. Plus the diff lived inside the setState updater.
- `a6df0b9`: Added cache-busting on the server's blob read. Without it, upserts silently merged against stale baselines.
- `c447566`: Moved the diff out of the setState updater into a post-commit useEffect on `[testCases]`, with a `persistedRef` baseline initialized at load time.
  - This still produced 133-148 phantom upserts per page-load on production. Stack trace in console pointed to the diff effect firing during a render cycle where `persistedRef` and `testCases` had different array references but identical content. The reference-equality `.filter(...)` swept ~40% of the cohort into a single 5.76 MB POST → 413.
- `37893b8`: Replaced the entire diff approach with the **explicit save helpers** above. This sidesteps reference equality entirely. But — as discovered after deploy — the `patchCase` implementation has the deferred-updater bug described above. `upsertCase` works; `patchCase` silently drops every save.
- `162a432`: `maxDuration = 300` on eval-baseline + per-tab "Pipeline" → "OpenAI (o3)" / "Claude (opus-4-7)" step label.

## Files most relevant
- `app/eval/page.tsx` — needs the ref-based patchCase rewrite. Helpers live around lines 237-260.
- `app/testing/page.tsx` — same helpers around lines 286-304.
- `components/testing-shared.tsx` — `upsertTestCases` / `deleteTestCases` / save error subscription. Save coordinator serializes one POST at a time. Banner subscribes via `subscribeToTestCaseSaveErrors`.
- `app/api/admin/test-cases/route.ts` — accepts both legacy full-replace and the new `{ upsert, deleteIds }` shape. Cache bypass on read.
- `app/api/admin/eval-baseline/route.ts` — single endpoint, OpenAI (`o3`, reasoning high) or Claude (`claude-opus-4-7`), prompted for JSON `{ diagnoses: [{ diagnosis, reasoning }] }`. `maxDuration = 300`.

## Data cleanup
There are 3 incompletely-saved v3 cases in production (`status: 'generated'`, no grading). They will inflate the SecondLook tab count but won't appear in the Version Summary stats. They can be deleted via the UI Delete button on each, or with:

```
curl -s -X POST "https://secondlook.vercel.app/api/admin/test-cases" \
  -H "Content-Type: application/json" \
  -d '{"deleteIds":["<id1>","<id2>","<id3>"]}'
```

Get the IDs with:

```
curl -s "https://secondlook.vercel.app/api/admin/test-cases" | node -e "
const d = JSON.parse(require('fs').readFileSync(0,'utf-8'));
console.log(d.testCases.filter(tc => tc.evalVersion === 'v3' && tc.status === 'generated').map(tc => tc.id).join('\n'));
"
```

## Open questions for tomorrow
- Is the deferred-updater theory correct? Verify with a console.log probe before applying the ref-based fix.
- Once persistence works on SecondLook, the OpenAI/Claude tabs should work end-to-end since they go through the same patchCase. Worth re-verifying with one case each.
- Consider whether to keep `legacy full-array POST mode in /api/admin/test-cases`. Migration scripts (`migrate-eval-version.mjs`, `promote-partial-run-v2.mjs`, `run-tests.mjs`, `run-benchmark.mjs`, `rescore-v6-failures.mjs`) still use it.
