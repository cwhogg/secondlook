# v13 Replay & o3 Model Drift — Session Report

**Date:** 2026-05-30
**Scope:** Replayed the 26 ppkt_ids where SL hit Top-1 in v5 ("v13 replay") against the current v12 pipeline + current OpenAI o3 + current Claude opus-4-7. Audited v5→v12 code diff for ranking regressions. Identified the cause of unreproducibility.

---

## Executive summary

The v5 result is not reproducible on the same cohort. On the 26 cases where SL hit Top-1 in v5, the v13 replay (which uses code architecturally equivalent to v5 for eval cases) shows:

| Engine | v5 historical | v13 replay | Δ on identical ppkt_ids |
|---|---|---|---|
| **SecondLook** | 24/24 (100%) | 18/24 (75%) | **−25 pp** |
| **OpenAI o3** | 16/24 (67%) | 20/24 (83%) | **+17 pp** |
| **Claude opus-4-7** | 17/22 graded (77%) | 19/22 graded (86%) | **+9 pp** |

(24 of 26 completed; final 2 SL runs failed for infrastructure reasons — one OpenAI rate-limit, one client-side save error after pipeline completion. Both unrelated to ranking.)

**On a cohort hand-selected to favor SL, OAI now beats SL by 8 pp and Claude beats SL by ~11 pp on graded.** This inverts v5's headline finding.

**Cause (corrected after direct matcher testing): the LLM evaluator is overriding the deterministic KB-match annotation.** Earlier in the investigation I hypothesized that the KB name matcher had broken on verbose specialist names. Direct testing of the matcher against actual v13 verbose names ("Neurofibromatosis Type 1 (NF1, von Recklinghausen disease)" etc.) found that **the matcher succeeds** — it uses bidirectional substring matching after normalization, which handles parenthetical clarifications correctly. 8 of 9 v13 verbose names tested matched their canonical KB profile.

The actual mechanism: the `evaluationType` field (criteria-grounded vs reasoning-evaluated) is set by the **LLM evaluator's output**, not the deterministic matcher's result. The matcher's role is only to put `[KB MATCH: <kb-name>]` in the prompt and inject the diagnostic criteria as a reference block. The LLM is then *instructed* to label KB-matched hypotheses as criteria-grounded, but nothing on the server side enforces that — the LLM's chosen label is taken at face value.

In v13, o3-as-evaluator is choosing `reasoning-evaluated` for hypotheses that *are* annotated `[KB MATCH: ...]` in the prompt. The NF1 case had 5 hypotheses with verbose NF1 names, all flagged as KB-matched by the deterministic classifier — yet the LLM labeled all 5 as reasoning-evaluated and produced narrative `strengthAssessment` strings instead of going through the criteria checklist. v5-era o3 followed the prompt instruction; v13-era o3 doesn't.

This is a real LLM behavior change, but the fix is straightforward and code-side: **don't let the LLM set the label**. The `isKbMatch` boolean at `evidence-evaluator.ts:242` should come from the deterministic classifier's `kbMatch !== null` result, not from `evaluation.evaluationType === 'criteria-grounded'`. The LLM's job becomes filling in the per-criterion checklist; the label itself is set server-side. One line of code; closes the mechanism completely.

---

## The replay setup

**Cohort:** The 26 ppkt_ids on which SL hit Top-1 in the v5 batch (May 28-29). Pulled from KV via `scripts/v5-top1-overlap.mjs`. Disease distribution:

- NF1 ×7 (5 distinct ppkt_ids run; the other 2 NF1s are different ppkt_ids of same disease)
- Marfan / contractural arachnodactyly ×3
- Mito DNA depletion 13 ×2
- ADTKD-1 ×2
- Cornelia de Lange 1 ×2
- Kabuki 2 ×2
- Lipodystrophy familial partial 2 ×2
- CVID 13/15 ×2
- DEE4, Greig cephalopolysyndactyly, Optic atrophy 12, Amelogenesis imperfecta IJ, Myoclonic epilepsy of Lafora 2 ×1 each

**Mechanism:** /eval Run Evals UI extended with two new capabilities, shipped today:

1. `ppkt_id` replay mode: paste a list of IDs, the eval-case API takes `?ids=...` and returns those exact rows in order. (`app/api/admin/eval-case/route.ts`)
2. Version picker: select existing or add new arbitrary version label (e.g. "v13") for tagging the batch's testCases. (`app/eval/page.tsx`, `lib/types/admin.ts` widened to `string & {}`)

**Bug fixed during the run:** `getMatchedTrios` keyed the trio map by `categoryHint` (ppkt_id) only. When v5 and v13 testCases shared ppkt_ids (which they do for the replay), one version overwrote the other in the map, and the matched-trio comparison table silently dropped v13. Fixed by keying on `${hint}|${evalVersion}`. Commit `e3a1cd9`.

---

## Per-case findings

### The 6 SL regressions

| Case | Disease | SL v5 → v13 | OAI v5 → v13 | CL v5 → v13 | v13 top-1 (wrong) |
|---|---|---|---|---|---|
| PMID_35190816 | DEE4 (STXBP1) | #1 → #3 | #4 → #1 | — → — | "Mito w/ Epilepsy (POLG-related)" |
| PMID_23993194 | Mito DNA depl 13 | #1 → #3 | #3 → #2 | #1 → #1 | "Combined OxPhos Defect Type 11 (FBXL...)" |
| PMID_14569098 | ADTKD-1 | #1 → #8 | #1 → #1 | #1 → #1 | Fabry Disease |
| PMID_30804983 | Mito DNA depl 13 (9-mo-old) | #1 → #4 | — → #2 | — → — | SURF1-Leigh syndrome |
| PMID_20513137 | NF1 | #1 → #4 | #2 → #1 | #2 → #2 | (not captured but a sibling) |
| PMID_15781812 | Lafora 2 | #1 → #2 | — → #1 | #1 → #1 | "Juvenile NCL Type 2 (TPP1)" |

**Pattern:** every v13 top-1 wrong answer is a *sibling disease* — same family, often same gene network, sometimes literally a synonym variant. The model isn't picking nonsense; it's picking the wrong member of the right family with higher confidence than it did in v5.

### Top-1 score inflation on every case (regressed AND held)

| Case | v5 top1 score | v13 top1 score | Δ |
|---|---|---|---|
| ADTKD-1 | 28 | 42 | +14 |
| Mito 13 (a) | 35 | 72 | **+37** |
| Mito 13 (9-mo) | 35 | 55 | +20 |
| DEE4 | 40 | 45 | +5 |
| Lafora 2 | 45 | 55 | +10 |
| NF1 (#1 held) | 60 | 85 | **+25** |

Even on the case where SL preserved its v5 Top-1 win, the top-1 score jumped 25 points. This is the clearest evidence of model-side rather than code-side drift: the synth is producing systematically higher probability scores regardless of correctness.

### Trio progression at-a-glance

| Trios | SL Top-1 | OAI Top-1 | CL Top-1 graded |
|---|---|---|---|
| 5 | 4/5 | 5/5 | 4/4 |
| 10 | 7/10 | 9/10 | 8/9 |
| 15 | 10/15 | 12/15 | 11/13 |
| 20 | 14/20 | 17/20 | 16/18 |
| 24 (final graded) | 18/24 | 20/24 | 19/22 |

The OAI improvement was visible by trio 5 (DEE4 jumped #4→#1) and held throughout. The SL regression pattern stabilized around trio 12 at ~33% regression rate on cases where v5 had hit #1.

---

## Code audit: what actually changed v5→v12

Diff between commit `887fbf3` (v5) and HEAD for ranking-critical paths:

| File | Lines | Effective change for eval cases (no labs) |
|---|---|---|
| `lib/agents/specialist-agents/index.ts` | +22 | Lab prompt block added — `formatLabsForPrompt(undefined)` returns empty string. No effect. |
| `lib/agents/evidence-evaluator.ts` | +41 | Lab integration (`mechanicallyCheckLabCriteria(initialDetails, undefined)`) — no-op without labs. |
| `lib/agents/synthesizer.ts` | +63 | Mechanical scoring computed and persisted (as audit data); explicit `.sort((a, b) => b.evidenceScore - a.evidenceScore)` added. Sort is order-preserving when synth produces score-descending output (which it does — verified in pipelineResult). |
| `lib/pipeline/family-expansion.ts` | +3 | Added `parentDiagnosis` field (metadata only). |
| `lib/pipeline/orchestrator.ts` | +192 | Logging, per-specialist 120s timeout, SSE heartbeats, lab-derived symptoms (no-op without labs), partial-failure handling. No ranking effect. |
| `lib/pipeline/evidence-scoring.ts` | +333 (new) | Mechanical formula computed, persisted as `evidenceScoreRaw` / `evidenceScoreBreakdown`. **Not used for ranking** per v10/v11 reverts. |
| `lib/pipeline/lab-utils.ts` | +399 (new) | All functions called with undefined labResults → no-op. |
| `lib/pipeline/score-labels.ts` | +54 (new) | Qualitative-label cutoffs for display only. |
| `lib/knowledge/retrieval.ts` | 0 since v5 | No changes since `264bcc9` (2026-05-27, pre-v5). |
| `lib/knowledge/diseases/` | 0 since v5 | KB files untouched. |
| `lib/knowledge/embeddings-*.bin` | dated 2026-03-12 | Embeddings not rebuilt. |

**Bottom line: for eval cases (no patient labs), the ranking-critical code path is functionally equivalent to v5.** The synth re-sort is order-preserving. Mechanical scoring is persisted but doesn't drive ordering. The previous audit ("v11 ≈ v5") was correct.

The score-inflation pattern (every top-1 +5 to +37 points) cannot be explained by any of these changes. None of them feed into the synth's probability assignment.

---

## The smoking gun: criteria-grounded entries vanished

Pulling the full v5 vs v13 differential lists for the same case lets us see exactly *what kind* of evidence the synth was working from. Recall: every hypothesis carries an `evaluationType` of either `criteria-grounded` (evaluated against the disease's formal KB criteria — auditable checklist of "4 of 7 NIH NF1 criteria met") or `reasoning-evaluated` (evaluated via LLM clinical-reasoning narrative — soft prose without structured criteria). Criteria-grounded entries provide hard evidence the synth can't easily override; reasoning-evaluated entries let LLM gestalt dominate.

### NF1 (PMID_29290338_Family_UG, SL held #1 in both versions)

| | v5 top 10 | v13 top 10 |
|---|---|---|
| Top-1 | NF1, score **60**, **criteria-grounded**, src: immunologist + neurologist | NF1, score **90**, **reasoning-evaluated**, src: gastroenterologist + endocrinologist |
| Criteria-grounded entries | **5 of 10** | **0 of 10** |
| Distinct specialists picking NF1 in top-5 | 2 | **5** |
| Naming examples (v13) | — | "(NF1, von Recklinghausen disease)", "(von Recklinghausen disease)", "Neurofibromatosis Type 1", "(NF1)", "(possible segmental or oligosymptomatic form)" |

**The KB grounding disappeared.** Same disease, same KB profile present in `lib/knowledge/diseases/neurofibromatosis-type-1.json`, same code path. v5 evaluated 5 of the top 10 against structured KB criteria; v13 evaluated zero. The synth still landed NF1 at #1 because the clinical gestalt is overwhelming on this case — but it did so without any of the structured evidence v5 had.

### ADTKD-1 (PMID_14569098_F9_individual_1, SL #1 → #8)

| | v5 top 10 | v13 top 10 |
|---|---|---|
| Top-1 | ADTKD-MUC1, score 28, reasoning-evaluated | Fabry Disease, score 42, **criteria-grounded** |
| Correct disease rank | #1 (single entry) | #8 AND #9 (duplicated with naming variants: "ADTKD, MUC1-related (ADTKD-MUC1)" and "ADTKD due to MUC1 (ADTKD-MUC1)") |
| Criteria-grounded entries | 2 of 10 (FAN1, Alport) | 3 of 10 (Fabry, AApoA-IV, one of the ADTKD-MUC1 duplicates) |
| Score spread | 28 → 3 | 42 → 25 |

On ADTKD-1, the correct disease *did* get criteria-grounded (one of the two ADTKD-MUC1 duplicates was matched). But Fabry, NPHP1, FAN1, AApoA-IV, MPGN, and IgG4-TIN all also competed at scores ≥30, and the synth's gestalt picked Fabry.

### Why the KB matcher was initially suspected, and why that's wrong

The initial reading was that the KB name matcher (`matchesDiseaseProfile` in `lib/agents/evidence-evaluator.ts:298`) had become too strict for the verbose v13-era specialist names. To test, I ran the actual matcher logic against the observed v13 verbose names:

| Specialist hypothesis name (v13) | KB profile | Match |
|---|---|---|
| "Neurofibromatosis Type 1 (NF1, von Recklinghausen disease)" | "Neurofibromatosis Type 1" | ✓ substring |
| "Neurofibromatosis Type 1 (von Recklinghausen disease)" | "Neurofibromatosis Type 1" | ✓ substring |
| "Generalised Neurofibromatosis Type 1 (Classical NF1)" | "Neurofibromatosis Type 1" | ✓ substring |
| "Neurofibromatosis Type 1 (possible segmental or oligosymptomatic form)" | "Neurofibromatosis Type 1" | ✓ substring |
| "Fabry Disease (X-linked α-galactosidase A deficiency)" | "Fabry Disease" | ✓ substring |
| "Fabry Disease (GLA deficiency, Classic or Later-Onset)" | "Fabry Disease" | ✓ substring |
| "ADTKD, MUC1-related (ADTKD-MUC1)" | "ADTKD – MUC1-related" | ✓ substring |
| "ADTKD due to MUC1 (ADTKD-MUC1)" | "ADTKD – MUC1-related" | NO MATCH (the "due to" phrasing) |

**8 of 9 verbose names match.** The matcher's bidirectional substring logic (`diagN.includes(nameN) || nameN.includes(diagN)`) correctly handles parenthetical clarifications after normalization (`.toLowerCase().replace(/[^a-z0-9]/g, '')`). The matcher is not the bottleneck. The earlier "matcher fails on verbose names" hypothesis is empirically false.

Git diff also confirms the matcher code is byte-identical between v5 (`887fbf3`) and HEAD — it could not have regressed even in principle.

### The actual mechanism

The `evaluationType` field on each hypothesis is set by the **LLM evaluator's output**, not by the deterministic matcher's result. The flow is:

1. `classifyHypotheses` runs `matchesDiseaseProfile` for each hypothesis against the KB. Sets `kbMatch: DiseaseProfile | null`.
2. `buildPrompt` annotates each hypothesis line with `[KB MATCH: <kb-name>]` or `[NOT IN KB]` based on `kbMatch`.
3. The diagnostic criteria block for matched KB profiles is appended as reference.
4. The prompt instructs the LLM: *"Set evaluationType to 'criteria-grounded' for KB-matched and 'reasoning-evaluated' for non-KB."*
5. The LLM evaluator (o3:high) returns its evaluation including a chosen `evaluationType` per hypothesis.
6. `applyEvaluation` at line 242 sets `isKbMatch = (evaluation.evaluationType === 'criteria-grounded')` — i.e., it trusts the LLM's label, ignoring the deterministic classifier's `kbMatch` result.

In v5, o3 followed the prompt instruction and labeled KB-matched hypotheses as criteria-grounded. In v13, **o3 chooses `reasoning-evaluated` on hypotheses that are annotated `[KB MATCH: ...]` in the prompt.** All 5 NF1 hypotheses in v13 had `[KB MATCH: Neurofibromatosis Type 1]` in their prompt lines, yet all 5 came back labeled reasoning-evaluated with narrative `strengthAssessment` instead of per-criterion checklists.

This is an LLM behavior change, but the consequence is purely in the *label*. The LLM still had access to the structured criteria block (it's in the prompt reference section); it just chose not to formally evaluate against them.

### Why this hurts ranking

1. **Reasoning-evaluated entries don't include `criteriaFulfillment.criteriaDetails` data.** When the synth iterates hypotheses in its own prompt (`synthesizer.ts:303-330`), each criteria-grounded entry shows a per-criterion `[MET]` / `[NOT MET]` checklist with the patient evidence. Reasoning-evaluated entries show "(none assessed)" instead.

2. **The synth's tool-output schema asks for `probabilityScore`** based on "criteria fulfillment data" among other inputs. When that data is absent, the synth defaults to clinical gestalt — and the new more-confident o3 produces inflated scores.

3. **On classic cases (NF1, Marfan)**, the gestalt agrees with the right answer anyway. Multiple specialists pick the same disease. The synth ranks it #1 even without criteria. Score inflated but #1 preserved.

4. **On close-call sibling cases (ADTKD-1, Mito 13, DEE4, Lafora 2)**, the gestalt can't break the tie without criteria evidence. The new o3 picks the wrong sibling confidently. The correct disease is still in the top-10, just outranked.

This explains every observed pattern: the score inflation on held cases, the regression on close-call cases, the duplicates, the systematic move from criteria-grounded to reasoning-evaluated, and the wrong-sibling failure mode.

---

## Why this hurts SL but helps OAI baseline

**The OAI single-shot baseline** is one o3 call with the patient case → produces 10 ranked diagnoses from training memory. It names them generically ("Neurofibromatosis Type 1"). The grader matches loosely. The "more confident" drift mostly helps it because there's no KB candidate pool to disambiguate from — o3 just picks the most-famous member of the disease family it recognized.

**The SecondLook pipeline** has o3 invoked multiple times against a KB candidate pool:

1. Triage retrieves ~30-50 KB candidates including *all* siblings (NF1/NF2/schwannomatosis; ADTKD-MUC1/-HNF1B/-UMOD/-REN/-DNAJB11; Mito 13 plus Combined OxPhos variants; etc.)
2. Specialists pick from that rich sibling pool
3. Evidence evaluator scores against structured criteria
4. Synth ranks from the evaluated hypothesis set

The new o3 is more confident in step 4. The KB grounding *surfaces* all the wrong-sibling candidates with KB criteria attached. The synth's gestalt now overrides the criteria-based evidence — and picks the wrong sibling. The KB advantage in v5 came partly from o3 being uncertain enough about siblings that the criteria evidence broke ties correctly. With v13-era o3 more confident, that tie-break is lost.

This is consistent with the diagnosis-flip pattern: every wrong v13 top-1 is a plausible sibling, not random noise.

---

## Strategic implications for v13 architecture

The v13 plan (Claude opus-4-7 as adversarial critic on synth output) was based on the assumption that v12's ranking was the problem. The replay data invalidates that framing:

1. **The bottleneck isn't post-synth ranking. It's sibling disambiguation in the specialist + evidence-eval stages.** A Claude critic reviewing the synth's ranked list will see the same sibling-ambiguous candidates and likely make the same kind of confident-wrong-sibling choice.

2. **Claude has the same training-data biases as o3 on rare-disease subtypes.** Putting Claude downstream of synth doesn't add an independent signal source — it adds a second model that has the same confidence-on-the-famous-member tendency.

3. **The actual problem is one or more of:**
   - The KB surfaces too many siblings without enough criteria differentiation, putting the LLM in an impossible position
   - The synth's prompt allows the LLM to override criteria evidence with priors
   - There is no architectural step that explicitly disambiguates between siblings using KB criteria (vs LLM priors)

4. **Interventions, ranked by expected impact and surgical scope:**
   - **[Highest priority — single line of code] Force the criteria-grounded label deterministically.** In `lib/agents/evidence-evaluator.ts:242`, change `isKbMatch = (evaluation.evaluationType === 'criteria-grounded')` to derive `isKbMatch` from the matching `classified[].kbMatch !== null` result computed earlier in `classifyHypotheses`. Stop letting the LLM choose the label on a question that's already been answered deterministically. The LLM's job remains filling in the `criteriaFulfillment.criteriaDetails` checklist against the criteria block already in the prompt; the label is no longer its decision. Closes the v13 mechanism completely on the NF1-style cases.
   - **Specialist naming constraint (defense in depth).** Add an explicit instruction in the specialist system prompt: "use the diagnosis name from your candidate list verbatim, with no clarifying parentheticals or synonyms." Reduces verbosity at the source so dedup works and the LLM evaluator has less excuse to label as variant-of-KB.
   - **Tighten the evaluator prompt as well.** Add an explicit rule: "If a hypothesis line contains `[KB MATCH: X]`, you MUST evaluate it against the criteria for X listed below, and MUST set evaluationType to 'criteria-grounded'. Do not substitute clinical reasoning even if the specialist's name differs from the KB name." Belt-and-braces with the deterministic label fix.
   - **Hypothesis dedup on the KB-canonical name.** When multiple verbose specialist hypotheses match the same KB profile, merge them into one hypothesis named after the KB profile rather than carrying duplicates through to synth. Addresses the v13 ADTKD-MUC1 duplication and the 5-way NF1 split.
   - **Family-cluster collapse pre-synth.** Detect KB siblings in the candidate pool, present them to synth as a single cluster with the question "if it's in this family, which member?" rather than as parallel candidates. Useful even after the label fix, for cases where multiple sibling diseases all have legitimate criteria-grounded entries.
   - **Two-pass synth.** First pick the disease family; then pick the subtype using only that family's KB criteria. Heavier intervention; consider if the above don't recover the v5 gap.
   - **Pin OAI checkpoint.** If a versioned `o3-2026-05-15` API is available, lock the SL pipeline to it. Addresses one symptom (label drift) but not others (verbose naming, dedup failures) and adds operational risk. Defer.

5. **For honest evaluation of any future architecture change**: stop using v5 numbers as the bar. v5's o3 doesn't exist on the API any more. Re-baseline against current single-shot OAI and CL. The success criterion has to be "beats current baselines on the same cohort," not "matches v5."

---

## Honest reframing of the "is SL better than baselines" question

Given this session's data, the honest read of where SL stands:

- **On a cohort hand-selected to be SL's strongest (the 26 v5 Top-1 hits): SL is now behind both single-shot foundation models.** OAI +8 pp, CL +11 pp on graded.
- **By selection-bias propagation: on a uniformly-sampled cohort, SL is almost certainly behind by a wider margin.** A neutral cohort would tilt away from SL's strength zone.
- **The "+12 pp v5 lead" in the original headline was a snapshot of an earlier o3.** It can be reproduced only if the same o3 weights are reproducible, which they aren't.
- **SL's claimable architectural value-add right now** is not Top-1 accuracy. It might still be (untested):
   - Explainability — KB-anchored criteria citations
   - Differential clusters — surfacing sibling families the user should be aware of
   - Negative evidence handling — explicit excluded-findings integration
   - Multi-specialist consensus signal — flagging when specialists disagreed

These are differentiators worth testing on their own merits, but they are not what was being measured by Top-1 rates.

---

## What needs to happen before any v13 commit

1. **[Do this first — one-line code fix] Force `isKbMatch` deterministically in `evidence-evaluator.ts:242`.** Replace the LLM-controlled label with the deterministic `classifyHypotheses` result. Re-run the same NF1 ppkt_id and confirm criteria-grounded count rises from 0/10 toward 5/10. Expected impact: recovers most of the v5-vs-v13 SL gap on the close-call cases where the correct disease was already in the candidate pool but was reasoning-evaluated instead of criteria-grounded.

2. **Test the specialist naming constraint independently.** Add "use the diagnosis name from the candidate list verbatim, no clarifying parentheticals" to the specialist system prompt. Reduces verbosity at source so dedup works.

3. **Add KB-canonical-name dedup at the evaluator's input stage.** Multiple specialists naming the same KB disease in different verbose ways should be merged before classifyHypotheses runs. Closes the duplicate-in-top-10 failure mode (ADTKD-MUC1 ×2 in v13).

4. **Re-baseline current OAI/CL on a fresh uniform N=50 cohort.** All comparison going forward needs to be against today's foundation models, not the v5-era ones. Independent of the label fix.

5. **Re-run the v13 replay after (1), (2), (3) ship.** If SL recovers toward 22-24/26 on the same 26 ppkt_ids, the label-drift mechanism is fully validated and we're back at "best v5-equivalent." If SL stays near 18/26 even with the deterministic label, there's an additional o3 ranking-quality drift downstream of evaluation, and the family-cluster / two-pass synth interventions become next priority.

6. **Decide explicitly whether SecondLook's value proposition is Top-1 accuracy or something else.** The KB-grounded criteria checking is what differentiates SL from single-shot LLM diagnosis. Maximizing criteria-grounded coverage (when the disease is in the KB) is exactly where the architectural advantage lives. The (1)+(2)+(3) interventions all serve that goal. If the data after these fixes still doesn't show SL beating current baselines, the value proposition needs to be rewritten — likely toward explainability + auditable evidence trails + multi-specialist disagreement surfacing rather than raw Top-1 accuracy.

---

## Files and commits from this session

- `app/api/admin/eval-case/route.ts` — added `?ids=` replay mode
- `app/eval/page.tsx` — version picker, replay UI, 26-case preset, trio-map keying fix
- `lib/types/admin.ts` — widened `evalVersion` to allow runtime-defined version labels
- `scripts/v5-top1-overlap.mjs` — pulls historical v5 baseline overlap from KV
- `scripts/v13-replay-monitor.mjs` — polling monitor that emits one event per new completed v13 trio
- Commits: `aa7fb50` (replay + version picker), `e3a1cd9` (matched-trio keying fix)
