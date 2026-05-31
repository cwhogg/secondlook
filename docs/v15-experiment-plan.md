# SecondLook v15 — Architectural Experiment Plan

**Status:** Committed for build. Plan reflects decisions made 2026-05-30.
**Supersedes:** `docs/v14-next-version-plan.md` (v14 Tier 1A is incorporated as v15 step 1).
**Companion docs:**
- `docs/session-reports/2026-05-30-v13-replay-o3-drift.md` — the investigation that produced this plan
- `docs/pipeline-data-flow.md` — current architecture reference
- `docs/v14-next-version-plan.md` — earlier surgical-fix-only plan, superseded
- `docs/v12-explainer.html` — current pipeline visual reference

---

## What we're doing

Building v15 as an architectural experiment with the explicit goal of **dramatically improving SL Top-1 accuracy vs current foundation-model baselines**, not just incrementally beating the prior version.

Background: the v13 replay on the 26 v5 SL Top-1 hits found that current OAI o3 and Claude opus-4-7 single-shot baselines now match or exceed SL on the cohort hand-selected to favor SL. Incremental fixes recover to prior parity but don't differentiate. v15 attempts to re-establish a meaningful SL lead by combining four capabilities baselines structurally lack.

Build target: ~6 hours of focused work. Measurement: 42-case v5-cohort replay tagged `v15`. Cost: ~$5 in API extras beyond baseline pipeline cost.

---

## The path to this plan — how the discussion progressed

This plan emerged from a conversation that started with "investigate the v13 regression" and ended with "rebuild the architecture." Key turning points:

### Step 1 — Initial diagnosis assumed code regression

When the v13 replay showed SL at 18/24 on cases it hit 24/24 in v5, the first hypothesis was that code changes between v5 (commit `887fbf3`) and v12 had broken ranking. Audited the diff: synthesizer, evidence evaluator, retrieval, KB — all functionally equivalent to v5 for eval cases (no labs). Code regression hypothesis: ruled out.

### Step 2 — Score inflation pointed at model drift

Pulled top-1 scores for each regressed case. Found systematic +5 to +37 point inflation across regressed AND held cases. On the held NF1 case, top-1 score rose from 60 to 85 — even with the same final ranking. Score inflation on a held case isn't explainable by code changes. Reframed: **OpenAI's o3 model behavior shifted between 2026-05-28 and 2026-05-30.**

### Step 3 — Narrowing further: criteria-grounded coverage collapsed

Pulled the full v5 vs v13 differential lists for the NF1 case. Found that:
- v5 NF1: 5 of 10 top hypotheses were criteria-grounded against KB criteria
- v13 NF1: 0 of 10 — the KB grounding evaporated entirely

The evidence evaluator's LLM-assigned `evaluationType` label flipped from criteria-grounded to reasoning-evaluated on the same hypotheses against the same KB profile.

### Step 4 — Tested the matcher; it works

Initial hypothesis: the deterministic KB name matcher broke on v13's verbose specialist names ("Neurofibromatosis Type 1 (NF1, von Recklinghausen disease)"). Empirically tested by running the matcher logic against actual v13 names. 8 of 9 verbose names matched their KB profile correctly via the existing bidirectional substring logic. **The matcher hypothesis was wrong.**

### Step 5 — Found the actual bug

Traced the label assignment flow. The deterministic classifier correctly identifies KB matches. The prompt correctly annotates hypotheses with `[KB MATCH: ...]`. But the `evaluationType` field on the final hypothesis comes from the LLM evaluator's output — `evidence-evaluator.ts:242`:

```ts
const isKbMatch = evaluation.evaluationType === 'criteria-grounded';
```

The LLM is the source of truth for a label that should be deterministic. v13-era o3 ignores the prompt instruction and chooses `reasoning-evaluated` even on KB-matched hypotheses. **One-line fix:** derive `isKbMatch` from the deterministic classifier's `kbMatch !== null` result.

### Step 6 — Reframed the strategy

The one-line fix recovers criteria-grounded coverage but doesn't outperform current baselines. Current OAI o3 single-shot beats SL on the SL-favorable cohort even with criteria recovered. Surgical fixes alone get us back to parity, not ahead.

For real outperformance, we need capabilities baselines structurally lack:
- Wider candidate net than either KB retrieval or single-shot LLM alone
- Per-hypothesis structured data the LLM can't generate at synth-call time
- Independent decision-stage signal from a second model family
- Information-driven reconsideration when the two models disagree

### Step 7 — Designed the parallel synthesis + reconciliation mechanism

Discussion progressed through:
- Multi-round Claude-vs-o3 debate (too expensive, known convergence pathologies)
- Single Claude veto over o3 ranking (independent signal but no recovery if Claude agrees on wrong answer)
- Criteria-grounded auditor (safety net but limited upside)
- Ensemble averaging (smooths out signal — punishes the case where one model nails it and other misses)
- **Structured iterative reconciliation** (final pick — independent rounds, information exchange triggered by disagreement, bounded rounds, deterministic fallback)

The user's critical insight on averaging: "I have seen many examples where one model nails #1 and the other completely misses it. We want a critique environment where the model that missed gets new info from the model that hit, and now agrees based on the new data."

That framing directly motivated the structured iterative approach — independent assessment first, then information exchange only on disagreement, then bounded reconsideration rounds with criteria evidence as the final arbiter.

---

## Key design decisions and why

### Decision 1 — Keep the KB as candidate generator, add LLM-generated candidates alongside (union)

**Considered:** removing KB-driven retrieval entirely in favor of LLM-only candidate generation. Rationale would be that current OAI single-shot beats SL on the cohort, suggesting the KB is limiting us.

**Decided:** keep KB retrieval (it gives criteria-grounded coverage for diseases it hits — the structural moat) but add a parallel LLM-generated candidate stream. Union and dedup via KB-canonical-name match.

**Why:** the KB is additive when it hits. The criteria-grounded path is unique to SL and not replicable by single-shot baselines. But the KB has ~9,263 profiles and there are 10,000+ rare diseases — the missing ~700+ can never surface from KB retrieval. The LLM-generated stream covers that gap. We get both: KB grounding on its hits, broader coverage on its misses.

### Decision 2 — Don't enrich the full KB; use existing KB data better, with optional targeted enrichment

**Considered:** offline enrichment of all 9,263 KB profiles with per-disease specialist annotations (tests, diagnostic path, what to look for, rule-outs). Cost estimated at $420 with gpt-4.1, ~$2,800 with o3:high.

**Rejected as too expensive for an experiment.**

**Decided:** surface the KB data we already have more explicitly in the synth prompt. The KB already contains `differentialDiagnoses[].distinguishingFeatures`, symptom tiers, `keyFindings`, `redFlags`. These are not currently formatted per-hypothesis in the synth's prompt. Better prompt formatting captures most of the value at zero cost.

Optional addition: targeted enrichment of just the ~42 diseases appearing in the v5 cohort with trap/pitfall data and sibling discriminators (~$5).

**Why:** the v13 wrong-sibling failure mode was specifically that the synth lacked discriminator information between siblings. The KB *already* has discriminator data in `differentialDiagnoses[].distinguishingFeatures`. We were leaving it on the table by not formatting it into the synth prompt. Free fix first, expensive enrichment only if needed.

### Decision 3 — Provider boundary violation is acceptable for architectural experiment

**Considered:** maintaining the strict "analysis = OpenAI, testing = Anthropic" boundary that CLAUDE.md establishes.

**Decided:** allow Claude opus-4-7 in the analysis flow for v15. Boundary was operational (independent API quotas), not architectural. With explicit re-thinking of the architecture, we can revisit.

**Why:** the structural moat we're trying to add is independent signal at the decision stage. That requires a model from a different provider family with a different training distribution. Without crossing the boundary, we don't get that independence.

### Decision 4 — Structured iterative reconciliation, not averaging or free debate

**Considered three reconciliation approaches:**
1. **Deterministic rules** (agree → use o3; disagree → criteria-fulfillment ratio tiebreaker): too brittle, encodes assumptions into rules
2. **Ensemble averaging** (average probability per diagnosis, re-rank): smooths out signal in exactly the cases where it matters most — when one model nails the answer and the other completely misses, averaging punishes the right answer
3. **Lightweight LLM reconciler** (third LLM picks between the two rankings): adds another LLM with its own biases, doesn't capture the dynamic the user described
4. **Multi-round free debate** (o3 vs Claude argue N rounds): known convergence pathologies, eloquent argument wins

**Decided:** structured iterative reconciliation:
- Round 1: independent rankings (no cross-contamination)
- Agreement on top-1 → done, high confidence
- Disagreement → Round 2: each model sees only the other's top-1 + reasoning, asked to genuinely reconsider
- Agreement after Round 2 → done
- Persistent disagreement → Round 3: each model addresses the other's specific counter-argument
- Persistent disagreement after Round 3 → criteria-fulfillment ratio tiebreaker, surface uncertainty in output

**Why:** the goal of disagreement isn't compromise, it's truth. The user's insight: when one model has the right answer and the other doesn't have it in mind, structured information exchange surfaces it. Averaging would penalize the right answer; free debate could converge wrong. Bounded structured rounds with evidence citation requirements get the benefit of cross-provider independence while controlling the failure modes.

### Decision 5 — Bundle the deterministic label fix into v15, don't ship it separately

**Considered:** shipping v14 Tier 1A (deterministic `isKbMatch`) first, measuring its impact alone, then deciding whether v15 is needed.

**Decided:** include the label fix as v15 step 1, ship the bundle together.

**Why:** v14 Tier 1A alone recovers SL to v5 parity (best case). v5 parity is tied with current baselines. The fix is necessary but not sufficient for outperformance. Separate measurement adds cycle time without changing the decision — we need v15-scale changes either way. Ship together, measure once.

### Decision 6 — Skip A/B feature-ablation harness for the first experiment

**Considered:** building feature flags so each v15 component can be turned on/off independently, then running 4 variants to measure each feature's contribution.

**Decided:** skip the harness for the first experiment. Build the full bundle, measure once.

**Why:** if v15-full produces dramatic improvement, the immediate question is "ship it," not "ablate to see which feature helped." Ablation is a refinement project for after the experiment validates the architecture. If v15-full doesn't help, we go back to architecture design — not feature ablation.

The harness adds ~$200 measurement cost and ~2 hours of build for information we don't urgently need.

---

## The committed plan

Six components, building in this order so each step has a clean foundation:

### 1. Deterministic `isKbMatch` label (5 min)

**File:** `lib/agents/evidence-evaluator.ts:242`

**Change:**
```ts
// BEFORE — LLM decides the label
const isKbMatch = evaluation.evaluationType === 'criteria-grounded';

// AFTER — server-side enforces from deterministic classifier
const matchInfo = classified.find((c) => c.hypothesis.diagnosis === h.diagnosis);
const isKbMatch = matchInfo?.kbMatch != null;
```

The `applyEvaluation` function needs access to the `classified` array. Refactor so it's closed over a lookup map.

**Verifies:** `evaluationType` and `knowledgeBaseMatch` fields are determined by deterministic KB match, not LLM choice. Closes the v13 mechanism (LLM overriding the prompt's `[KB MATCH: ...]` annotation).

### 2. Union candidate pool (1 hour)

**Change:** in the orchestrator, after the existing triage retrieval, make a single broad o3 call that takes raw patient case + extracted symptoms and produces 30-50 additional candidate diagnoses. Combine with KB-retrieved candidates. Dedup via canonical KB-name match (using the existing `findDiseaseByName` lookup).

**Hypothesis:** KB retrieval covers diseases the KB has profiles for (~9,263); the LLM-generated stream covers gaps in KB coverage. Union improves the upstream recall of the pipeline.

**Implementation hooks:**
- `lib/pipeline/orchestrator.ts` — add Stage 1b LLM candidate generation after Stage 1 triage
- `lib/knowledge/index.ts` — add `findDiseaseByName` lookup for dedup canonicalization

### 3. Existing KB data surfaced in synth prompt (1 hour)

**File:** `lib/agents/synthesizer.ts:303-330` (the `hypothesesDetail` formatting block)

**Change:** per hypothesis, when the hypothesis has a KB match, add formatted blocks from the KB profile:
- **Sibling discriminators:** format `differentialDiagnoses[].distinguishingFeatures` as "vs Legius: NO neurofibromas, NO Lisch nodules; vs NF2: bilateral vestibular schwannomas"
- **Cardinal features (>90% in disease):** pathognomonic symptoms from KB symptom tiers
- **Common features (50-90%):** common symptoms from KB symptom tiers
- **Red flags / clinical traps:** the KB's `redFlags` array
- **Key diagnostic findings:** condensed `keyFindings.imaging` + `keyFindings.genetic` for what to verify

**Hypothesis:** the synth's wrong-sibling failure mode was specifically lacking discriminator information. The KB has it; we weren't surfacing it.

### 4. Targeted KB enrichment for v5-cohort diseases (~$5, 30 min build + 10 min runtime)

**Scope:** the ~42 unique diseases appearing in the v5 48-case cohort.

**Enrichment added per disease (using gpt-4.1):**
- `commonPitfalls`: array of clinical traps and common misdiagnoses
- `extendedDiscriminators`: structured "vs disease X, look for feature Y" entries beyond what's already in `differentialDiagnoses`
- `ruleOutCriteria`: features whose presence essentially excludes the diagnosis

**Implementation hooks:**
- New script: `scripts/enrich-cohort-kb.mjs` — runs gpt-4.1 calls for each of the ~42 diseases
- `lib/types/knowledge-base.ts` — add optional fields `commonPitfalls?`, `extendedDiscriminators?`, `ruleOutCriteria?`
- `lib/agents/synthesizer.ts` — surface these in synth prompt when present

**Validation:** spot-check the enrichment for 3-5 diseases manually before running the full 42. Flag if any enrichment cites things that aren't medically accurate.

### 5. Parallel independent synthesis (1.5 hours)

**Change:** `lib/agents/synthesizer.ts` — refactor `SynthesisAgent` to support a `provider` parameter. The orchestrator runs two synthesizers in parallel:
- `SynthesisAgent({ model: 'o3', reasoningEffort: 'high' })`
- `SynthesisAgent({ model: 'claude-opus-4-7', reasoningEffort: 'high' })`

Both receive identical input: patient case, enriched evaluated hypotheses. Neither sees the other's output at this stage.

Returns: `{ o3Ranking, claudeRanking }` with top-10 each plus per-diagnosis reasoning.

**Implementation hooks:**
- `lib/agents/base-agent.ts` — already supports model parameter; verify Claude API integration works through the same abstraction
- `lib/pipeline/orchestrator.ts` — replace single synth call with parallel synth + reconciliation

### 6. Structured iterative reconciliation (2 hours)

**New file:** `lib/pipeline/reconciliation.ts`

**Round 1:** both rankings from step 5.

**Agreement check:**
```ts
function topOneAgrees(o3Ranking, claudeRanking): boolean
```

**If agree:** ranking stands (use o3's). Confidence flag: `dual-model-consensus`.

**Round 2 (only on disagreement):**

For each model, issue a focused prompt:
```
PATIENT CASE: [patient case]

YOUR PRIOR ASSESSMENT — TOP-1: [your model's top-1] (probability: [%])
Your reasoning: [your model's reasoning for #1]

ANOTHER INDEPENDENT EXPERT CLINICIAN with the same patient case and same
KB criteria evidence has identified a DIFFERENT top-1:
  THEIR TOP-1: [other model's top-1] (their probability: [%])
  THEIR REASONING: [other model's reasoning for #1]

Honestly reconsider your ranking with this new information. Three options:
  1. AGREE — their #1 is more strongly supported. Update your top-1 to theirs.
  2. DISAGREE WITH NEW UNDERSTANDING — you see merit in their pick but believe
     yours is better. Keep yours and explain what specific evidence they may
     have overlooked.
  3. DISAGREE — you see no merit in their pick. Keep yours and explain why
     their reasoning doesn't hold given the available evidence.

CITE SPECIFIC criteria evidence or patient findings. Don't default to defending
your original pick — genuine reconsideration is the goal.

Return: { topOne: <diagnosis>, probabilityScore: <0-100>, reasoning: <string> }
```

Run this prompt for both models in parallel.

**Re-check agreement.** If now agree, done.

**Round 3 (only on persistent disagreement):**

For each model:
```
The other expert has reviewed your Round 2 reasoning and maintains their pick.
Their specific counter-argument to your top-1:
[other model's Round 2 reasoning]

Address this counter-argument directly. Is there evidence in the patient findings
or KB criteria that resolves this disagreement? After addressing it, give your
final top-1.

Return: { topOne: <diagnosis>, probabilityScore: <0-100>, reasoning: <string> }
```

**Re-check agreement.** If now agree, done.

**Persistent disagreement after Round 3:**
- Take the candidate with higher criteria-fulfillment percentage as operational top-1
- Tag result with confidence flag: `low - persistent-disagreement`
- Surface both candidates in `differentialClusters` with their respective evidence so the report makes the uncertainty visible

**Round caps:** max 3 rounds. Bounded.

---

## What we explicitly are NOT doing in v15

- **Full-KB offline enrichment** ($500-$3000, deferred until experiment validates the architecture)
- **Multi-round free-form Claude-vs-o3 debate** (rejected for convergence pathologies; the structured iterative approach captures the benefits without the risks)
- **A/B feature-ablation harness** (deferred; we measure the bundle first, ablate later if needed)
- **Per-specialist refinement pass at runtime** (the offline-cached version was rejected as too expensive for the experiment; runtime per-hypothesis enrichment by 5 specialists is even more expensive)
- **Pinning OAI o3 checkpoint** (operational risk, addresses one symptom not the root)
- **Removing KB-driven retrieval** (the union approach keeps both; KB stays as candidate generator alongside the LLM stream)

---

## Success criteria

**v15 ships and stays in production if:**
- SL Top-1 on the 42-case v5-cohort replay ≥ current OAI baseline by at least 10 pp (~37/42 vs ~30/42)
- AND no regression beyond stochastic noise on existing analysis-flow capabilities

**v15 ships in shadow mode (visible in /eval, default off for production) if:**
- SL Top-1 improvement is positive but < 10 pp lift over OAI baseline (suggesting a marginal architectural win that needs more measurement before production switch)

**v15 doesn't ship if:**
- SL Top-1 is at or below current OAI baseline on the 42-case cohort
- This would mean the architectural changes didn't add value and we need a different approach

**Revert criteria:**
- Any case where v15 hard-errors when v12 successfully returned an analysis
- Any case where v15 cost exceeds 3× v12 cost on the same case (suggests runaway reconciliation rounds)

---

## Measurement plan

After build complete:

1. **Re-run the 42-case v5 cohort** under v15. Tag as `evalVersion: 'v15'`.
2. **Compare against three baselines:**
   - v5 historical (already in KV)
   - Current OAI o3 single-shot (already in v13 replay KV)
   - Current Claude opus-4-7 single-shot (already in v13 replay KV)
3. **Headline metric:** SL Top-1 vs current OAI Top-1 on the 42-case cohort.
4. **Secondary metrics:**
   - SL Top-3, Top-5 recovery
   - Average criteria-grounded coverage per case (target: back to v5's ~30-50%)
   - Round-distribution for reconciliation (how often does Round 1 agree; how often does it go to Round 3)
   - Cost per case (must stay < 3× v12)
   - Disagreement rate between o3 and Claude at Round 1

The reconciliation round distribution is itself a research output — it tells us how often the two models actually disagree on rare-disease cases, which informs whether this architectural direction has legs.

---

## After v15 ships (or doesn't)

**If v15 produces dramatic lift (≥10 pp over baselines):**
- Ablation study: run the v15 variants individually to identify which features are load-bearing (the A/B harness becomes the post-validation refinement project)
- Full-KB enrichment: expand the cohort enrichment to the full ~9,263 KB profiles (~$2K, days of wall time)
- Production rollout: gradual traffic shift from v12 to v15

**If v15 produces marginal lift (1-9 pp over baselines):**
- Shadow mode in /eval for further measurement
- Investigate which v15 component is partially working
- Consider whether to invest more in that direction or pivot

**If v15 doesn't produce lift:**
- This rules out a major class of "more data + more model perspectives at decision stage" interventions
- Reframes the problem: SL's structural advantage may not be reproducible at current LLM capability levels
- Strategic discussion: pivot toward explainability + auditable evidence trails as the value proposition rather than Top-1 accuracy

---

## Build sequencing

Order matters because later steps depend on earlier ones:

1. **Step 1 (deterministic label)** — 5 min — closes the v13 bug, foundation for everything else
2. **Step 2 (union candidate pool)** — 1 hour — expands the candidate set everything downstream operates on
3. **Step 3 (better KB data in synth prompt)** — 1 hour — improves synth's input quality before changes to synth itself
4. **Step 4 (targeted KB enrichment)** — 30 min build + 10 min runtime — adds new KB fields the prompt will use
5. **Step 5 (parallel synthesis)** — 1.5 hours — restructures the synth call
6. **Step 6 (structured reconciliation)** — 2 hours — adds the new logic on top

Total: ~6 hours. First measurable result: after step 6 with a single-case test, then the 42-case replay.

Each step gets its own commit. Revert is per-step if anything breaks.
