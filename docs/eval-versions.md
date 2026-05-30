# Eval Version History

Each row records a single `evalVersion` tag persisted on test cases. Numbers come from the matched-trio comparison in `/eval` and from KV-stored stage metadata. "TBD" = not yet measured.

The headline accuracy metric is **Top-1** on the diversified-sampling cohort unless noted, because diversified is the cleanest signal for long-tail rare-disease performance (uniform is biased by Phenopacket2Prompt's concentration on DEE4/NF1/KBG).

---

## v1 — pre-2026-05-27 pipeline (legacy)

- **Specialist model**: gpt-4.1 (T=0.3, internist 0.4)
- **Specialist reasoning**: n/a (non-reasoning model)
- **Evidence-evaluator**: o3 reasoning:high
- **Synthesizer**: o3 reasoning:high
- **Report**: gpt-4.1-mini
- **Triage**: gpt-4.1-nano
- **Synthesizer top-N**: 5
- **Family expansion**: none
- **Excluded-findings handling**: none
- **Score formula**: synth LLM probabilityScore = both confidenceScore and evidenceScore (no mechanical scoring)
- **Eval baseline**: not configured
- **Results**: not measured under this framework (predates the trio comparison)

## v2 — 2026-05-27 pipeline

- **Same as v1 plus**:
  - Synthesizer emits top 10 (was top 5)
  - KB-linked family-expansion entries appended at ranks 11–15 (deterministic, no LLM call, uses each KB entry's `differentialDiagnoses` field)
- **Results**: not directly measured in trio comparison

## v3 — excluded-findings integration

- **Specialist model**: gpt-4.1
- **New**: explicit excluded findings (negative evidence) extracted by parse-symptoms, UMLS-mapped, passed to retrieval + specialists + evidence-evaluator
- **Eval baseline**: OpenAI o3 / Claude opus-4-7, asks for top **5**, JSON output
- **Results** (uniform sampling, N≈30): SL Top-1 ≈ 30%, OAI ≈ 40%, CL ≈ 37%

## v4 — KB matcher tightened + parsimonious-common reverted

- **Same model stack as v3**
- **Changes**:
  - Reverted `0efc386` (the "specialists may surface parsimonious common diagnoses" prompt loosening — was hurting rare-disease Top-1, e.g. Secondary HPT outranking ADTKD-1 underlying cause)
  - Tightened `findDiseaseByName` so short KB names (<12 chars) cannot be substring-matched into long specialist phrases — fixes the "Ciliopathy → Cystic Fibrosis" family-expansion bug observed on Optic Atrophy 12 cases
- **Results** (uniform, N≈30): SL Top-1 ≈ 33%, OAI ≈ 43%, CL ≈ 37%

## v5 — specialists upgraded to o3 reasoning:high

- **Specialist model**: o3 reasoning:high (was gpt-4.1)
- **Evidence-evaluator**: o3 reasoning:high (unchanged)
- **Synthesizer**: o3 reasoning:high (unchanged)
- **Maximum specialist tokens**: 8000 (up from 4000)
- **analyze-patient-v2 maxDuration**: 300s (Vercel cap)
- **Results** (uniform, first 25 cases): SL Top-1 = 56%, OAI = 36%, CL = 40%
- **Results** (uniform, scaled to N=48): SL Top-1 = 52%, OAI = 40%, CL = 42%, SL Top-5 = 69%
- **Verdict**: confirms the harness works — 19-point Top-1 lift over v4 from the model-power upgrade. Cost ~$1.50/case, wall-clock 60–180s.

## v6 — eval baseline aligned to Phenopacket2Prompt protocol

- **Same pipeline as v5**
- **Changes**:
  - eval-baseline asks for top **10** (was top 5), matching the published Robinson et al. benchmark
  - System prompt picks up the protocol's "single definitive diagnosis…almost always confirmable by a genetic test" framing
  - Claude `maxTokens` raised 4096 → 8192 to fit 10 entries with reasoning
- **Results** (uniform N=30): SL Top-1 ≈ 33%, OAI ≈ 43%, CL ≈ 37%
- **Note**: comparable to published Exomiser (35.5% Top-1, N=5213). Direction is right but small-sample.

## v7 — deterministic mechanical evidenceScore

- **Same model stack as v6**
- **Score formula changes** (`lib/pipeline/evidence-scoring.ts`):
  - `evidenceScore` no longer = synth's probabilityScore. Now computed from:
    - KB-grounded track: `0.40·criteriaFulfillmentRatio + 0.30·symptomMatchScore + 0.10·specialistAgreementScore − 0.05·contradictionPenalty − 0.15·excludedFindingPenalty`
    - Non-KB track: `0.45·symptomMatchScore + 0.30·evidenceQualityScore + 0.15·specialistAgreementScore − 0.10·contradictionPenalty`
  - Downstream-condition penalty (×0.5): a diagnosis listed as `downstreamOf` a higher-scored peer in the same differential is halved
  - Family-expansion entries inherit `parent.evidenceScore × 0.5` instead of the prior silent zero
  - `confidenceScore` still carries synth's LLM probability — surfaced separately when it diverges from mechanical evidenceScore
  - Per-component breakdown persisted on each hypothesis (`evidenceScoreRaw`, `evidenceScoreBreakdown`, `scoringVersion`)
- **Qualitative label**: 60+ Strong, 45–59 Moderate, 30–44 Suggestive, 15–29 Possible, <15 Weak (anchored to actual formula range, not 0–100)
- **Results** (uniform N=48): SL Top-1 = 52%, OAI = 40%, CL = 42% (matched v5; no regression from scoring change)
- **Results** (diversified N=23): SL Top-1 = 30%, OAI = 35%, CL = 43%
- **Failure rate**: 24% (8 of 34 SL attempts stuck at `status: 'running'` with no diagnostic data)

## v8 — specialists dropped to o3:medium + safety nets

- **Specialist reasoning**: medium (was high)
- **Evidence-evaluator + synthesizer**: high (unchanged — ranking-critical)
- **New client-side safety nets** (`/eval` runPipeline):
  - SSE idle timeout: 90s no-bytes → throws `'SSE idle timeout…'`
  - Hard pipeline cap: 280s elapsed → AbortController fires → throws `'Pipeline exceeded max duration…'`
- **New display**: Top-10 column in matched-trio comparison; controls block moved above the comparison table; comparison rows labelled per `(version, samplingMode)` cohort
- **Results** (diversified N=24): SL Top-1 = 17%, OAI = 25%, CL = 21% — but **zero ppkt_id overlap with v7 diversified**, and Claude (same model both versions) dropped 22 pts which signals the cohort was harder. **Inconclusive on whether medium hurt accuracy.**
- **Results** (uniform N=13, partial): SL Top-1 = 15%, OAI = 31%, CL = 23% — high failure rate this batch (41%) confounds the read
- **Wall-time vs v7**: per-specialist call −23% (42.2s → 32.6s); slowest-specialist-per-case (parallel bottleneck) −22% (51.8s → 40.4s); total wall-clock per case −12% (~122s → ~107s)
- **Failure rate**: 10% diversified, 41% uniform on the most recent batch
- **Key gotcha**: in-flight cases use the *client* bundle that was loaded when the run started; a push during a run leaves stuck cases without the new safety nets because the client didn't reload

## v8 instrumentation push (no model change, no version bump)

Bundled with v8 specialist drop and shipped together:

- **Per-specialist 180s timeout** in orchestrator: each specialist call wrapped in `Promise.race` against a per-call timeout. 1–2 specialist failures recovered gracefully via Promise.allSettled-equivalent. Later tightened to **120s** in `0236f68` based on observed distribution (max 84.7s across 616 calls; 120s = ~1.4× max-ever-observed).
- **Persisted `pipelineProgressLog`** on TestCase: every SSE event the client receives appended with elapsed-ms, flushed to KV on stage transitions. Stuck cases now show "last known position" instead of zero metadata.
- **Structured Vercel logs**: `[orch] event=… t=…ms …` tags at every stage boundary and per-specialist start/done/fail. Grep-able post-mortem.

## v9 — specialists back to o3 reasoning:high

- **Specialist reasoning**: high (reverted from medium)
- **All v8 instrumentation carries through**: 120s per-specialist timeout, persisted progressLog, structured logs, SSE idle + 280s cap
- **Purpose**: clean high-vs-medium comparison on the new instrumented stack. Failures should now have diagnostic data attached so we can attribute the v7 24% / v8 10% (or worse on bad batches) failure rate to a specific cause.
- **Results**: TBD

---

## Cross-version configuration matrix

| Version | Specialist model | Specialist reasoning | Eval baseline top-N | KB filter | Mechanical evidenceScore | Per-specialist timeout | SSE/client safety nets | Persisted progress trail |
|---|---|---|---|---|---|---|---|---|
| v1 | gpt-4.1 | n/a | n/a | yes | no | none | none | no |
| v2 | gpt-4.1 | n/a | n/a | yes | no | none | none | no |
| v3 | gpt-4.1 | n/a | top 5 | yes | no | none | none | no |
| v4 | gpt-4.1 | n/a | top 5 | yes (tightened matcher) | no | none | none | no |
| v5 | o3 | high | top 5 | yes | no | none | none | no |
| v6 | o3 | high | top 10 (P2P-aligned) | yes | no | none | none | no |
| v7 | o3 | high | top 10 | yes | yes | none | none | no |
| v8 | o3 | medium | top 10 | yes | yes | 180s → 120s | yes | yes |
| v9 | o3 | high | top 10 | yes | yes | 120s | yes | yes |

## Reading the headline numbers

- **v3 → v5**: +19 pts SL Top-1 uniform (gpt-4.1 → o3 specialists). The single biggest accuracy improvement on record.
- **v5 / v7**: equivalent uniform performance, +0 net from mechanical scoring. The mechanical formula was a structural fix (ADTKD downstream-condition, OPA12 family-expansion) not a Top-1 lift.
- **v7 diversified vs uniform**: 30% vs 52% — confirms corpus-concentration bias. Uniform sampling oversamples DEE4/NF1/KBG (we're good at those); diversified hits the long tail (we lose to Claude).
- **v8 wall-time**: unambiguous −20–25% improvement on specialist stage. Accuracy delta vs v7 still unclear due to cohort variance.
- **v9**: about to be measured.

## Process notes / instrumentation lessons

- **Sampling mode**: `samplingMode: 'uniform' | 'diversified'` is persisted on each test case so the comparison table splits cohorts. **Uniform** matches the Phenopacket2Prompt published protocol (use for "vs Exomiser / o1-preview / GPT-4o" comparisons). **Diversified** picks one random case per unique diagnosis label (use for pipeline-quality on long tail).
- **Trio runner**: skips cases whose ppkt_id already has a complete graded trio; failed cases stay in KV with `status: 'error'` (since v8 — prior versions deleted them on any-mode failure).
- **Sampling-mode UX gotcha**: the dropdown defaults to "Uniform" only on a fresh page load. State persists across batches in the same tab — easy to accidentally run another diversified batch when you intended uniform.
- **Mid-batch push gotcha**: a Vercel deploy during a run leaves all in-flight cases on the *old* client bundle (new client-side instrumentation won't activate). Hard-refresh after the deploy to get the new bundle; this kills the running batch.
- **Stuck cases with no metadata**: pre-v8 batches produced these often (24% v7) and we couldn't diagnose. v8+ persists `pipelineProgressLog` so this is no longer invisible.
