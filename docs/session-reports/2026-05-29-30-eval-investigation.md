# SecondLook Eval Investigation — Session Report

**Dates:** 2026-05-29 to 2026-05-30
**Scope:** v6 → v11 architectural investigation, instrumentation buildout, and accuracy regression analysis on Phenopacket2Prompt-style rare disease vignettes.

---

## Executive summary

We spent two days building diagnostic instrumentation, investigating an apparent SL Top-1 regression, identifying that most "stuck" cases were our own SSE safety net killing valid in-flight evidence-eval calls, and tracing a real ranking regression to two v7 post-synth processors. The current measured state at session end:

- **SL v10 (N=30 uniform): 40% Top-1, 50% Top-5, 50% Top-10** — statistically tied with OpenAI o3 single-shot (43% Top-1) and Claude opus-4-7 single-shot (40% Top-1).
- **v11 reverts the last two v7 post-processors** (downstream penalty, family-expansion scoring) plus the `downstreamOf` schema addition. Behavioral parity with v5 except for one ~1%-impact safety net and one provable no-op. Not yet measured at scale.
- **v12 (planned) — dual-model generation (opus + o3) + adversarial critique** — queued for build only if v11 confirms the harness isn't beating single-shot baselines.

The fundamental question — does SecondLook's multi-agent + KB architecture genuinely outperform single-shot LLM diagnosis on rare disease vignettes? — is **not resolved**. The honest read on v10 numbers is that we are tied with baselines on the corpus-natural distribution. v5's 54% Top-1 (N=48), which had been our headline win, may have been an unrepresentative draw. v11 data will tell us.

---

## Final measured numbers (this session)

| Cohort | N | SL Top-1 | OAI Top-1 | CL Top-1 | SL Top-5 | OAI Top-5 | CL Top-5 |
|---|---|---|---|---|---|---|---|
| v5 uniform | 48 | **54%** | 42% | 44% | 71% | 65% | 58% |
| v7 diversified | 23 | 30% | 35% | 43% | 43% | 43% | 52% |
| v8 diversified | 24 | 17% | 26% | 22% | 35% | 35% | 39% |
| v8 uniform (pre-fix) | 16 | 13% | 25% | 19% | 50% | 38% | 50% |
| **v9 uniform (mechanical scoring active)** | **52** | **13%** | **38%** | **42%** | **31%** | **52%** | **52%** |
| **v10 uniform (LLM ranking restored)** | **30** | **40%** | **43%** | **40%** | **50%** | **50%** | **47%** |
| v11 uniform (full v5 ranking parity) | TBD | TBD | TBD | TBD | TBD | TBD | TBD |

**Headline pattern:** the v7 mechanical-scoring change was a 27-point SL Top-1 regression on uniform sampling (54% → 13%). v10 recovered ~27 points (13% → 40%) by reverting the rank key to synth's LLM probability. The remaining gap to v5 (40% vs 54%) is being tested by v11.

---

## Architecture changes audited this session

**Layered, oldest to newest:**

| Stage | Layer | What we tested |
|---|---|---|
| v5 baseline | o3:high specialists, synth LLM ranking, KB-grounded scoring | 54% Top-1 uniform on N=48 |
| v6 | + eval baseline aligned to P2P protocol (top 10) | No change to SL pipeline |
| v7 | + mechanical `evidenceScore` as rank key, downstream-of penalty, family-expansion scoring | **−24 pts Top-1 diversified vs v5 expectation** |
| v8 | + per-specialist 120s timeout, persisted progressLog, structured logs, **specialists at medium** | Wall-time −22%; ~50% of "failures" still mystery |
| v8 mid-fix | + 90s SSE idle timeout, 280s pipeline cap | Most "stuck" cases became `status: error` SSE timeouts |
| v9 | reverted specialists to high reasoning | No improvement over v8; failure mode reproduced; mechanical scoring was the real regression |
| v9 mid-fix | + 30s server heartbeats during evidence-eval/synth, raised SSE idle to 180s | Failure rate dropped 24% → 10%; **uncovered that prior "stuck" cases were our own safety net killing valid runs at exactly 90s evidence-eval silence** |
| v10 | reverted `evidenceScore` to LLM `probabilityScore`; kept mechanical formula as audit data | **+27 pts SL Top-1 recovery (13% → 40%)** |
| v11 (just pushed) | + dropped `applyDownstreamPenalty`, `applyFamilyExpansionScoring`, and `downstreamOf` schema field | Pending |
| v12 (planned) | dual-model (opus + o3) generation, KB as post-hoc citation, adversarial critique, no specialty agents | Not built |

---

## Key learnings

### 1. The "stuck case" mystery was a false alarm of our own making

For most of the session we believed v7 had a real 24% failure rate where cases mysteriously hung server-side. The new persisted `pipelineProgressLog` revealed the real pattern:

```
t=7-10s    triage + specialists start
t=24-55s   all 11 specialists complete
t=55-64s   evidence-eval START  ← single SSE event, then SILENCE
t=145-154s SSE idle timeout fires → client-error
```

**Evidence-evaluator at o3:high reasoning over 40+ hypotheses routinely takes 80–112s of pure reasoning silence** — no progress events emitted until the LLM returns. The original 90s SSE idle timeout (v8) was killing legitimate evidence-eval calls. One case (Patient_1) squeaked through at exactly 82s of silence; two failed at exactly 90s.

This re-frames pre-fix accuracy numbers: cases that survived to be graded had below-average evidence-eval durations, biasing the headline accuracy upward by excluding slow-eval cases. Numbers reported across v6–v9 are slightly inflated for SL.

**The fix:** server-side heartbeat progress events every 30s during evidence-eval and synth, plus raising the client SSE idle threshold to 180s. Heartbeats keep the stream alive during real reasoning; 180s still catches genuine hangs.

### 2. Mechanical scoring was a 27-point Top-1 regression

The v7 mechanical `evidenceScore` formula:

```
KB-grounded: 0.40·criteriaFulfillmentRatio
           + 0.30·symptomMatchScore
           + 0.10·specialistAgreementScore
           − 0.05·contradictionPenalty
           − 0.15·excludedFindingPenalty
```

**The problem:** the 0.40 weight on `criteriaFulfillmentRatio` systematically penalizes rare-disease correct answers. Phenopacket-style vignettes rarely contain the genetic/biopsy confirmations the formal criteria require, so rare-but-correct diseases get low scores. Common-but-wrong diseases with easily-verifiable lab/clinical criteria score high.

This produced the ADTKD failure pattern at scale:
- *ADTKD-1 case:* "Secondary HPT due to CKD" scored 85 (lab criteria neatly satisfied); the correct UMOD-related ADTKD scored 30 (no genetic test in the vignette to satisfy the criterion).
- The downstream-of penalty we added was meant to fix this specific case but generalizes only weakly.

Synth's LLM `probabilityScore` uses soft judgment that absorbs vignette context the formula throws away — "this is a rare-disease vignette, criteria gaps are because we don't have genetic data, weight the gestalt." Mechanical scoring loses that.

**Implication:** auditable mechanical scoring is structurally appealing but empirically worse than LLM judgment on this dataset. Demoted to audit data in v10.

### 3. 11 specialists isn't 11 perspectives — it's 11 phrasings of the same model

The Osteogenesis imperfecta type IX failure case (OI-IX) was instructive:

```
GT: Osteogenesis imperfecta, type IX
SL output:
  #1-3: Bruck Syndrome variants (3 specialists herded here)
  #5-10: Hypophosphatasia variants (6 specialists herded here)
  #11: Osteogenesis Imperfecta (generic, family-expansion only)
```

Both baselines hit OI at rank 1 immediately. Our 11 specialists — same base model, different prompts — converged on KB-adjacent wrong families rather than the obvious answer, because:
1. The KB-rerank shortlist surfaced Bruck (FKBP10/PLOD2) and Hypophosphatasia profiles prominently; specific OI variants weren't separate KB entries.
2. Once anchored to the available KB profiles, every specialist optimized within that frame, none escaped.

This is the specialty herding failure mode the dual-model architecture (v12) would test directly: replace 11 same-model role-plays with 2 actually-different foundation models + adversarial reconciliation.

### 4. Sampling matters — diversified ≠ uniform for accuracy interpretation

Phenopacket2Prompt has 9,587 vignettes but only 694 unique diagnoses. The top 15 cover ~28% of the corpus (DEE4 alone is 4.8%). Uniform random sampling oversamples these common-in-corpus diseases; diversified sampling (one random case per unique diagnosis) draws from the true long tail.

| Mode | SL strength | Claude strength | OAI strength |
|---|---|---|---|
| Uniform | We were strong here (v5 era) — KB had good coverage of the common-in-corpus diseases | Stable | Stable |
| Diversified | Weaker — long-tail diseases often had sparse or AI-generated KB profiles | Claude opus wins meaningfully | OAI o3 stable |

Adding the diversified sampling mode was one of the most valuable changes this session for diagnostic clarity. Without it, the corpus concentration would have masked the long-tail weakness.

### 5. KB-as-filter has clearly negative side effects; KB-as-citation may still help

Concrete bugs traced to KB-anchoring:

- **Ciliopathy → CF/PID family-expansion bug:** The KB entry "Ciliopathy" was AI-generated and listed Cystic Fibrosis and Primary Immunodeficiency as differential diagnoses (consistent with respiratory ciliary dyskinesia, not the broader ciliopathy class). When a long specialist diagnosis ("Retinal ciliopathy due to mutation in the RPGR gene...") substring-matched the 10-char "Ciliopathy" KB name, family expansion pulled CF and PID into ranks 13–14 on an optic atrophy case.
- **OPA12 family-expansion bug:** Specific OPA12 wasn't a KB entry; the closest matches were unrelated.
- **General pattern:** ~50% of the 9,263 KB profiles were AI-generated for the v4 Orphanet expansion. AI-generated profiles vary in quality and have caused real failures.

The structural lesson: KB as a *citation source* attached to a freely-generated differential probably has value (clinical credibility, recommended testing, criteria documentation). KB as a *filter or anchor* on which candidates specialists consider has demonstrably failed on multiple long-tail cases. v12's "KB as post-hoc citation only" tests this directly.

### 6. Headline numbers from any version with N < 30 are unreliable

The session's repeated cycle of "this version looks like X% Top-1, then we ran more cases and it's actually Y%" reinforced that with N ≤ 30, binomial SD on Top-1 is ~9 points. Most observed deltas were 1–2 SDs and not statistically meaningful. The 27-point v9 → v10 jump (13% → 40%) was the only swing in this session large enough to confidently attribute to a code change rather than cohort variance.

Going forward: nothing under N=50 should be treated as a real signal unless the delta is >15 points.

### 7. Cross-version comparisons need stable sampling and stable code

Our v5 vs v9 "regression" reading was confounded by:
1. Different random draws of ppkt_ids (zero overlap between v5 N=48 and v9 N=52)
2. Pre-fix SSE timeout selection bias (v5–v9 with the 90s timeout silently excluded slow-eval cases differently than the natural distribution)
3. Mid-batch code pushes during runs leaving some cases on old client bundles

The session's most reliable comparisons came from versions tested *after* the heartbeat fix on cohorts that finished cleanly. Pre-fix numbers (v5, v6, v7 diversified, v8 mid-batch) all have selection-bias uncertainty that we can't fully un-bias.

---

## Hypotheses tested and what we found

| Hypothesis | Test | Outcome |
|---|---|---|
| The harness beats single-shot baselines | v5 N=48 uniform | Apparent +12 pts SL Top-1 lift — but we now suspect cohort variance. v9/v10 measurements stat-tied with baselines. |
| Specialty agents add real diagnostic value | Inferred from OI-IX, Netherton, Loeys-Dietz failure cases | Specialists herd on KB-adjacent wrong families. Multi-perspective signal is weaker than the prompt-architecture suggests. |
| Mechanical scoring removes LLM ranking bias | v7 introduced; v9 measured at 13% SL Top-1 | Refuted. Mechanical scoring introduced a worse systematic bias (criteria-favorable common conditions outrank rare correct ones). |
| Specialists at o3:high cause stuck cases | v9 high vs v8 medium | Refuted. ~1% specialist timeout rate at 120s. Both reasoning levels showed the same 13% Top-1 floor on the mechanically-ranked v9/v8 batches. |
| 90s SSE timeout was sufficient for evidence-eval at o3:high | v9 batch with persisted progressLog | Refuted. Evidence-eval median 91s, p90 112s — 90s was killing roughly half of valid evidence-eval calls. |
| Server-side heartbeat preserves the SSE safety net | v9 post-fix batch | Confirmed. 0% false-positive SSE timeouts. |
| Reverting mechanical scoring as rank key recovers v5 territory | v10 N=30 | Partially confirmed. +27 pts recovery (13% → 40%). Remaining 14-pt gap to v5 N=48 may be cohort variance, residual v7 changes (`downstreamOf` field, family-expansion scoring), or v5's 54% being unrepresentative. v11 tests this. |
| Per-specialist 120s timeout kills valid reasoning | Observed distribution (max 84.7s across 616 calls) | Refuted. 0% reasoning kill rate. Timeout protects against genuine hangs only. |
| Diversified sampling reflects long-tail performance | Multiple v7/v8 diversified runs | Confirmed. Claude opus consistently wins diversified; uniform performance not predictive of long tail. |

---

## What the v10 numbers actually say

At N=30 uniform with all three models:

```
SL v10:    40% Top-1  43% Top-3  50% Top-5  50% Top-10
OAI o3:    43% Top-1  50% Top-3  50% Top-5  50% Top-10
CL opus:   40% Top-1  47% Top-3  47% Top-5  47% Top-10
```

Top-1 confidence interval at N=30 (95%, Wilson score): ~±15 points. The three measured numbers (40%, 43%, 40%) overlap heavily. The honest read is **statistical tie** across all three.

What this means in plain terms:
- On the corpus-natural distribution, our 14-LLM-call, ~$1.50/case, 60–180s wall-time pipeline produces results indistinguishable from a single ~$0.05/case, 10s-wall-time call to OpenAI o3 or Claude opus.
- The complexity is not earning its keep on this dataset's headline metric.

What this does *not* mean:
- The output format we produce (ranked differential with reasoning, criteria documentation, recommended testing) is a real product differentiator that single-shot baselines don't deliver. Headline Top-1 doesn't measure that.
- The harness might still win on the long tail (diversified) or on specific case types we haven't disaggregated.
- v11 might show a meaningful lift if the v7 post-processors were the residual harm.

---

## Pending data and open questions

**Pending data:**
- v11 batch — full v5-ranking parity (drops downstream penalty, family-expansion scoring, `downstreamOf` schema). Tests whether the v5-vs-v10 gap was real architecture difference or cohort variance.
- Larger-N v10 / v11 measurements (N=50–100) to tighten confidence intervals.

**Open questions for next session:**
1. Is the multi-agent + KB harness genuinely beating single-shot baselines on rare disease vignettes? Current best evidence (v10 N=30) says no; v11 will refine.
2. If v11 ≈ v10, would the v12 "dual-model + adversarial critique" architecture beat single-shot? Untested.
3. Does the KB add real value as a *citation source* attached to a freely-generated differential? Architecturally plausible; not measured.
4. What fraction of the Phenopacket2Prompt corpus is well-covered by our KB vs sparsely-covered? Coverage assessment never done.
5. Does the LLM-vs-mechanical-formula divergence signal (persisted as audit data on every hypothesis) predict failure modes? Untested but persisted infrastructure is ready.

---

## Decisions made and queued

**Shipped in this session:**
- v10: synth LLM probability as rank key; mechanical formula demoted to audit data
- v11: drop `applyDownstreamPenalty`, `applyFamilyExpansionScoring`, `downstreamOf` schema (just pushed, no data yet)
- Per-specialist 120s timeout + graceful degradation
- Persisted `pipelineProgressLog` on every TestCase
- Structured Vercel `[orch]` logs
- Server-side heartbeat during evidence-eval / synth
- Client SSE idle timeout raised 90s → 180s
- Baseline error persistence to KV (fixes silent runner failures)
- Top-10 column in matched-trio comparison
- Diversified sampling mode
- Version-and-samplingMode-split matched-trio table
- Lab upload / extraction / mechanical criteria-confirm pipeline (Phases 1, 2, 3 — no-op on eval cases since vignettes lack uploaded labs)
- Numeric version sort in comparison table (v10 ranks above v2)

**Queued, not built:**
- v12 — dual-model (opus + o3) generation + KB-as-citation-only + adversarial critique. Engine flag in orchestrator, classic path preserved. Build only if v11 confirms stat-tied performance vs baselines.
- KB quality audit — coverage assessment of Phenopacket2Prompt diagnoses against our KB; quality assessment of the ~4,700 AI-generated profiles.
- Calibration of qualitative labels from raw LLM probability distribution (current cutoffs were calibrated for the mechanical formula range; v10/v11 labels under-fire at the high end).
- Disaggregated accuracy by disease family / corpus frequency / KB coverage. May reveal hidden wins/losses obscured by the headline number.

**Explicit non-decisions** (we didn't commit to these):
- Whether to ship v10 / v11 to real users in production. Eval results don't translate directly — vignettes lack lab data, patient history nuance, and the structured-output product differentiator isn't measured in Top-1.
- Whether KB curation effort is worth the headcount cost. Returns depend on diagnoses users present with, which we don't have data on.
- Whether to keep the multi-agent architecture or rebuild around dual-model + critique. v11 and v12 measurements are the deciding inputs.

---

## Methodology notes for future sessions

1. **Don't quote any Top-1 number off a batch smaller than N=30 without explicit "this is preliminary, ±15 pts" framing.** I made this mistake repeatedly this session.
2. **Always check for selection bias from failure handling.** SSE timeout killing valid cases was the biggest hidden bias of the session.
3. **Persistent progress trails are the single most valuable diagnostic tool we shipped.** Every long-running stage should emit periodic events even if the data is empty — the keepalive itself is the diagnostic signal.
4. **Server logs (Vercel) are time-limited; KV-persisted trail is forever.** Prefer trail-in-KV over logs-in-Vercel for anything you might want to query later.
5. **Hard refresh between any pipeline-code push and the next batch.** The client bundle locks at page load; cases started on the old bundle are diagnostically blind even if the server has the new code.
6. **Both baselines need to be measured on every cohort.** Without OAI + CL on the same cases, cohort variance is invisible. Cross-baseline drift is the cleanest cohort-difficulty control we have.
7. **Version comparison tables should split by (version, samplingMode) jointly.** Pooling them obscures the bias.
8. **A regression is real only when the magnitude survives 2× cohort SD.** Smaller deltas are noise.

---

*This report is the institutional memory of the v6–v11 investigation. Update with v11 measurement results when they arrive. Add v12 build notes and results in a follow-up section, not a separate file, so the full investigation chain stays in one place.*
