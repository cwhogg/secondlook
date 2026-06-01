# v17 Architecture

## Why this change

v16 underperforms baselines materially on the 22-case matched-trio cohort: SecondLook 14% Top-1 vs OpenAI o3 45% / Claude opus-4-7 27%. Zero unique SL wins in v16 — every case SL got, the simpler single-shot baselines also got, and the baselines got 8 more.

The root cause is architectural, not per-prompt. v5 had 11 o3:high specialists generating evidence-rich hypotheses; v15 kept them with augmentation; v16 replaced them with a single o3 candidate-generator producing bare names. Net clinical-reasoning depth in v16: ~1/11 of v5.

v17 reintroduces specialists in a more focused form (5 instead of 11) with v16 annotation augmentation, then replaces the v15 dual-synth reconciliation with a Claude-first evaluation + o3 critique + Claude finalize sequence. The AI Provider Separation rule is formally relaxed for the analysis flow so providers can be chosen per-stage.

## Stage map

| Stage | Agent | Provider | Status |
|---|---|---|---|
| 0 | `deriveSymptomsFromLabs` | n/a | unchanged |
| 1 | `TriageAgent` | OpenAI gpt-4.1-nano | unchanged |
| 2 | `SpecialistV17Agent` × 5 in parallel | OpenAI o3:high | v5-reused with v16-field addendum |
| 3 | `dedupAndNormalizeHypotheses` | n/a (deterministic) | new |
| 4 | KB profile attach | n/a (deterministic) | new |
| 5 | `ClaudeEvaluatorAgent` (thin wrapper) | Anthropic claude-opus-4-7 | new — reuses `EvidenceEvaluator.buildPrompt` verbatim |
| 6 | `ClaudeSynthAgent` | Anthropic claude-opus-4-7 | reused AS-IS, zero modification |
| 7 | `O3CriticAgent` | OpenAI o3:high | new |
| 8 | `ClaudeFinalizerAgent` | Anthropic claude-opus-4-7 | new |
| 9 | `expandFamilyVariants` | n/a (deterministic) | unchanged |
| 10 | `ReportGenerator` | OpenAI gpt-4.1-mini | unchanged |

## Reuse posture (user-mandated)

The user explicitly required maximum reuse of the existing evidence-evaluator and synthesizer prompts and code, which were validated through v5–v15. The implementation reflects this:

- **v5 specialist prompts** — both `domainSpecialistPrompt` and `generalInternistPrompt` are copied verbatim into `specialist-v17.ts`. The only addition is a ~3-sentence `V17_ANNOTATION_ADDENDUM` instructing the specialist to also populate `diagnosticTests`, `cardinalFeatures`, `ruleOutFeatures`, and `domainConfidence` per hypothesis. `maxTokens` raised 8000 → 60000 to fit the larger output.
- **Evidence-evaluator prompt + workflow** — `buildEvidenceEvaluatorPrompt` (system prompt), `EvidenceEvaluator.buildPrompt` (user prompt builder), `classifyHypotheses` (deterministic KB matching), `applyEvaluation` (per-hypothesis enrichment with lab confirmation), and `deduplicateHypotheses` are all reused verbatim by `claude-evaluator.ts`. Only the backend call swaps from OpenAI tool-call to `callAnthropic`. ~150 LOC wrapper, zero prompt rewriting. Methods made public on `EvidenceEvaluator` to enable reuse without subclassing.
- **Synthesizer** — `ClaudeSynthAgent` (which already uses Claude opus-4-7 and reuses `SynthesisAgent.buildPrompt`) is consumed directly. Zero new code, zero prompt changes.
- **Reconciliation prompt patterns** — the "AGREE / STAND / DISAGREE with evidence-cited reasoning" framing from `reconciliation.ts:buildRound2Prompt` is the model for `o3-critic.ts`'s system prompt. The per-candidate `tests / cardinal / rule-out` shape from `specialist-annotator.ts` informs the critique-suggestion schema.

## Specialist selection algorithm

5 distinct specialists per case:
1. `geneticist` (anchor)
2. `general-internist` (anchor, gets NO KB candidates — un-anchored counterweight)
3. Top entry from `triage.relevantSpecialties` that isn't already an anchor
4. Next entry from triage ranking that isn't already selected
5. Next entry from triage ranking that isn't already selected

`selectV17Specialists` in `specialist-v17.ts` walks the ranking, skipping already-selected specialists. Always returns 5 distinct.

## Dedup (Stage 3)

Deterministic, no LLM. Goal: zero info loss.

Group hypotheses by normalized name (lowercase + strip non-alphanumeric + reuse `matchesDiseaseProfile` substring/alias logic from evidence-evaluator). Per group:

- **Canonical name selection — tiered:**
  1. **KB-anchored** — if any variant resolves to a KB DiseaseProfile via `findDiseaseByName`, use that profile's `.name` field. KB names are authoritative.
  2. **Specialist consensus** — variant proposed by the most specialists (wisdom of crowds).
  3. **Shortest variant** — tiebreaker. Biases toward umbrella term, NOT toward over-specific. Avoids "Cone-rod dystrophy 13 (CABP4-related)" becoming canonical when most specialists said "Cone-rod dystrophy."
- All variant names preserved as `nameVariants[]` on the merged hypothesis.
- `supportingEvidence`, `contradictoryEvidence`, `diagnosticTests`, `cardinalFeatures`, `ruleOutFeatures` = union across specialists with `attributedTo: specialty` preserved on every evidence item.
- `domainConfidenceMap: Record<specialty, number>` = per-specialist confidence preserved.
- `confidenceScore` = max across specialists.
- `clinicalReasoning` = concatenated by specialty.

**Detailed logging** for early Risk-3 (over-splitting) detection:
- `dedupStats.suspiciousPairs[]` — textually-close cross-group pairs detected via Levenshtein. Logged at INFO via `orch.dedup.suspicious`.
- `dedupStats.unmatched[]` — single-member groups.
- `dedupStats.groups[]` — per-group breakdown with `canonicalChosenBy` (kb-anchor / specialist-consensus / shortest) and `matchPath`.
- Validation invariant: every (specialty, evidence-finding) attribution from input is represented as at least one attribution in output. Asserted post-merge.

## Critic action set

`o3-critic.ts` action enum: `'promote' | 'demote' | 'reorder' | 'merge' | 'flag-gap'`.

`'add'` is intentionally excluded — specialists are the sole candidate source per architecture decision. The critic rearranges the existing pool but cannot expand it.

## Finalizer authority

Claude is the final decider per user spec. The finalizer at Stage 8 reviews each critique suggestion individually and decides honor or reject with cited reasoning. Each top-10 entry carries `changesFromFirstPass: { rankBefore, rankAfter, changeReason }` so the report layer can show what o3's critique actually changed vs Claude's first synth pass.

`changeReason` enum: `'no-change' | 'critique-promoted' | 'critique-demoted' | 'critique-reordered' | 'finalizer-override'`.

## Telemetry

`pipelineMetadata` gains four optional fields for v17:

- `specialistPool` — selected specialties + per-specialist token / time / model / failure data
- `dedupStats` — see above
- `critique` — confidence, suggestion count, accepted count, tokens, time
- `finalizerChanges` — rank changes, removed-from-top-10, added-to-top-10

`pipelineVersion: '17.0.0'`. `evalVersion: 'v17'` is added to the version union in `lib/types/admin.ts`.

## Provider separation rule change

Pre-v17 rule (CLAUDE.md): "Never mix providers" — analysis flow strictly OpenAI, testing framework strictly Anthropic.

v17 rule: analysis flow uses both providers per-stage. Testing framework remains Anthropic-only.

The rationale: by v17 the right tool for each role is the most capable model regardless of provider. Claude's verbose reasoning fits eval / synth / finalize; o3's structured reasoning fits specialists / critique. Forcing single-provider per flow is a constraint without a current value driver.

## Cost & timing

Per case at p50:
- Triage: $0.01
- Specialists × 5 (o3:high): ~$2.50
- Dedup + KB attach: $0
- Claude evaluator: ~$0.40
- Claude synth: ~$0.35
- o3 critic: ~$0.40
- Claude finalize: ~$0.40
- Family + Report: $0.05
- **Total: ~$4.00 / case (±30%)**

Wall time p50 ≈ 3.5 min, p95 ≈ 6 min. Within existing `maxDuration = 600s`.

## Decision rule for verification

v17 wins iff Top-1 (EXACT/VARIANT via v3 tiered grader) ≥ v16 + 5pp AND Top-5 ≥ v16 + 3pp on the 22-case matched-trio cohort. Below the rule: revert PR #3 (`git revert`), keep PR #1 + PR #2 as foundation for future iteration.

## Files

**New**:
- `lib/agents/specialist-v17.ts` (~330 LOC) — v5 specialist + v16 annotation fields
- `lib/agents/dedup-normalizer.ts` (~290 LOC) — deterministic dedup with suspicious-pair detection
- `lib/agents/claude-evaluator.ts` (~150 LOC) — thin wrapper around `EvidenceEvaluator`
- `lib/agents/o3-critic.ts` (~190 LOC) — new critic
- `lib/agents/claude-finalizer.ts` (~250 LOC) — new finalizer

**Modified**:
- `lib/pipeline/orchestrator.ts` — orchestrator rewrite, `pipelineVersion: '17.0.0'`
- `lib/types/index.ts` — `EvidenceItem.attributedTo`, new `DiagnosisHypothesis` v17 fields, new `CritiqueOutput`/`CritiqueSuggestion`, `PipelineMetadata` v17 telemetry
- `lib/types/admin.ts` — `'v17'` in version unions
- `app/eval/page.tsx` — v17 badge color (purple)
- `lib/agents/evidence-evaluator.ts` — visibility-only: `buildPrompt`, `applyEvaluation`, `classifyHypotheses`, `deduplicateHypotheses` made `public`; `buildEvidenceEvaluatorPrompt` exported. Zero behavior or prompt changes.
- `CLAUDE.md` — provider rule relaxed
- `~/.claude/.../memory/MEMORY.md` — architecture shift documented

**Reused as-is**:
- `lib/agents/claude-synthesizer.ts` (`ClaudeSynthAgent`)
- `lib/agents/synthesizer.ts` (`SynthesisAgent.buildPrompt` + `findHypothesisByName`)

**Left in tree, not imported**:
- `lib/agents/specialist-agents/index.ts`
- `lib/agents/specialist-annotator.ts`
- `lib/agents/candidate-generator.ts`
- `lib/pipeline/reconciliation.ts`

## Risks

1. **Specialists exceed 60K maxTokens** — same failure mode as v16 annotators. Mitigation: retry once at 80K on "No tool call" error (not yet implemented in `specialist-v17.ts` — defer to follow-up if observed).
2. **Eval call malformation** — Claude reads an OpenAI-tool-call-style schema. Reused `applyEvaluation` validates the response; eval and synth are separate calls so eval failure does not block synth.
3. **Deterministic dedup over-splits** — mitigated by suspicious-pair logging + validation invariant. If observed in cohort, v17.1 adds Claude name-pairing call (names only, no merging).
4. **v17 underperforms v16** — decision rule above gates the orchestrator rewrite PR.

## Out of scope

KB enrichment, embedding rebuild, retrieval scoring changes, specialist prompt tuning beyond the addendum, report-generator changes, family-expansion changes, grading changes, LLM-assisted dedup, cost optimization, removing legacy agent files.
