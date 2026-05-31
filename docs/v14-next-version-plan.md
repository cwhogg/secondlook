# SecondLook v14 Plan — Restore Criteria-Grounded Coverage + Maximize Per-Hypothesis Data

**Status:** Planning. Not started.
**Anchored to:** `docs/session-reports/2026-05-30-v13-replay-o3-drift.md`
**Strategic premise:** SL's structural advantage over single-shot foundation models is the volume and quality of structured, per-hypothesis information we put in front of the high-reasoning synthesizer. v14 closes the v13 regression and then deliberately expands that information set.

---

## Why this plan

The v13 replay (24/26 trios on the same ppkt_ids v5 hit Top-1) showed SL at 18/24 (75%) vs current OAI 20/24 (83%) and Claude 19/22 (86%). The cohort was hand-selected to favor SL; SL still lost.

Root cause confirmed by pulling v5 and v13 pipelineResults for the same NF1 case:
- **v5 NF1 case: 5 of 10 hypotheses criteria-grounded** (per-criterion checklist against KB structured criteria)
- **v13 NF1 case: 0 of 10 hypotheses criteria-grounded** (LLM evaluator labeled all as reasoning-evaluated despite `[KB MATCH: ...]` prompt annotations)

The deterministic KB matcher works (verified by direct test on actual v13 verbose names). The LLM evaluator (o3:high) is overriding the prompt instruction and choosing the wrong `evaluationType`. With no criteria-grounded entries, the synth defaults to clinical gestalt — and the new more-confident o3 picks wrong siblings on close-call cases.

**SL's value-add evaporated when criteria-grounded coverage went to zero.** Restoring it is the structural fix.

---

## Tier 1 — Restore the v5 criteria-grounded coverage

These three changes, in order, are expected to recover most of the v5 → v13 SL gap on the same cohort. All three are surgical.

### 1A. Force `isKbMatch` deterministically (1-line code fix)

**Where:** `lib/agents/evidence-evaluator.ts:242`

**Change:**
```ts
// BEFORE — LLM decides the label:
const isKbMatch = evaluation.evaluationType === 'criteria-grounded';

// AFTER — server-side enforces based on deterministic match:
const matchInfo = classified.find((c) => c.hypothesis.diagnosis === h.diagnosis);
const isKbMatch = matchInfo?.kbMatch != null;
```

The `applyEvaluation` function needs access to the `classified` array (currently scoped to the `execute` method). Either pass it in or refactor so `applyEvaluation` is closed over the lookup map.

**Why:** The deterministic classifier already computes whether each hypothesis matches a KB profile. The LLM is then asked to label `evaluationType` and the server trusts the LLM. v13-era o3 is overriding the annotation. The deterministic result is the right source of truth; the LLM still fills the per-criterion checklist content but no longer chooses the meta-label.

**Acceptance test:** Re-run PMID_29290338_Family_UG (NF1 case where v5 had 5/10 criteria-grounded and v13 had 0/10). Expect criteria-grounded count to return to 4-6 of 10. If yes, the mechanism is closed.

### 1B. Specialist naming constraint (defense in depth)

**Where:** `lib/agents/specialist-agents/index.ts` system prompt template.

**Change:** Append to the OUTPUT RULES block:

> When you receive a list of candidate diseases (the KB candidates), use their exact name verbatim in your hypothesis output. Do NOT append clarifying parentheticals, gene synonyms, or eponym variants. If you want to call out a specific subtype, name it as a separate hypothesis using its canonical name.

**Why:** v13 specialists produce names like "Neurofibromatosis Type 1 (NF1, von Recklinghausen disease)" instead of v5's cleaner "Neurofibromatosis Type 1 (NF1)". Constraining the input distribution at the source reduces variant proliferation and makes downstream dedup work. Complementary to 1A: 1A enforces correct labeling even when names are verbose; 1B reduces verbosity so dedup can collapse duplicates.

**Acceptance test:** Re-run the same NF1 case. Expect the 5-way NF1 split (5 separate hypotheses with slightly different parentheticals) to collapse to 1-2.

### 1C. KB-canonical-name dedup at evaluator input

**Where:** `lib/agents/evidence-evaluator.ts` `deduplicateHypotheses()` — currently dedups on the *raw specialist name*, which fails on naming variants.

**Change:** Before dedup, attempt KB match for each hypothesis. If the deterministic classifier finds a KB profile, rename the hypothesis to the canonical KB profile name. Then dedup. Multiple specialist hypotheses naming the same KB disease in different ways become one canonically-named hypothesis with merged evidence and a multi-source `sourceAgents` list.

**Why:** Even with 1B, some naming variation will survive (specialists may add subtype qualifiers). Canonicalizing on KB-match before dedup closes the duplicates-in-top-10 failure mode (ADTKD-MUC1 ×2 in v13).

**Acceptance test:** Re-run ADTKD-1 case. Expect ADTKD-MUC1 to appear once, not twice. The single canonical entry's `sourceAgents` list should contain all the specialists who picked any variant naming.

### 1D. Re-run the 26-case v13 replay

After 1A + 1B + 1C ship and pass acceptance tests, run the same 26-ppkt_id replay tagged as `v14-recovery`.

**Expected:**
- SL Top-1 recovers from 18/24 toward 22-24/26 (matching v5 ± stochastic variance)
- Average criteria-grounded coverage rises from ~10% to v5-era ~35-45%
- Top-1 scores compress from the v13 inflation back toward v5 levels (this is a side-effect of having criteria evidence to constrain the synth's gestalt)

If SL doesn't recover, the o3 ranking-quality drift is deeper than the label issue and Tier 2 / Tier 3 below become next priorities. If it does recover, Tier 2 becomes the long-term value-add work.

---

## Tier 2 — Expand the per-hypothesis information set

Premise: SL's architectural advantage is the structured data we pre-compute and feed to the high-reasoning synthesizer. Single-shot LLMs only see the patient case. We can see (and surface) much more.

This is the strategic direction beyond just restoring v5 parity. Each item below is a candidate for v14+ work, ranked by expected leverage. Each requires its own design pass before commit.

### 2A. Negative evidence per hypothesis (HIGH leverage)

**Idea:** For each hypothesized disease, the KB knows its pathognomonic and common features. If the patient's `excludedFindings` (things they explicitly DON'T have) contain a pathognomonic feature of the hypothesis, that's strong negative evidence. Surface it explicitly per-hypothesis in the synth's prompt.

**Current state:** `excludedFindings` are integrated globally but their per-disease implications aren't computed and surfaced as structured data.

**Proposed addition to each hypothesis line in the synth prompt:**
```
Pathognomonic features patient explicitly LACKS: [feature1, feature2]
→ This is strong negative evidence; downweight if listed features are required for diagnosis
```

**Why high leverage:** Negative evidence is exactly the kind of structured signal LLMs are bad at producing themselves. Single-shot LLMs see "patient denies X" but don't systematically check "does X being denied rule out disease Y?" Our KB tells us, deterministically, when an exclusion is decisive.

### 2B. Sibling differentiation context (HIGH leverage)

**Idea:** When the candidate pool contains multiple KB siblings (ADTKD-MUC1/-HNF1B/-UMOD/-REN/-DNAJB11; Mito 13/1-12/Combined OxPhos; NF1/NF2/schwannomatosis), include a *differentiation block* in the synth's prompt:

```
ADTKD SIBLING DIFFERENTIATION:
- ADTKD-MUC1: extrarenal features rare; UMOD-style tubular cysts on biopsy
- ADTKD-HNF1B: renal cysts on imaging, pancreatic atrophy, MODY-5
- ADTKD-UMOD: hyperuricemia + gout typically precede renal failure
- ADTKD-REN: anemia from early childhood, low aldosterone
- ADTKD-DNAJB11: cystic kidneys, late onset
Patient findings that disambiguate: <pulled from KB criteria + patient case>
```

**Why high leverage:** The v13 wrong-sibling failure mode is essentially the synth not knowing what *makes* one sibling more likely than another. The KB has this knowledge in `findFamilySiblings()` results and individual disease profiles. We just don't currently package it as differentiation guidance.

**Implementation hook:** `lib/knowledge/index.ts:findFamilySiblings()` already exists. Need to extend to also emit the differentiating-features block per family, then inject into the synth prompt.

### 2C. Differentiating tests per cluster (medium leverage, high clinical value)

**Idea:** For each pair or cluster of phenotypically-similar hypotheses, surface "what test would discriminate?" Already partially present in `computeDifferentiatingTests()`. Make it per-hypothesis-pair, not just per-cluster.

**Why:** Doesn't necessarily improve Top-1 ranking, but increases the clinical utility of the SL output — and that's what the v13 finding suggested SL's *actual* value proposition might need to shift toward.

### 2D. Per-specialist refinement pass (HIGH leverage but heaviest change)

**Idea:** After the evidence evaluator runs, send the consolidated hypothesis list back to each specialist with a domain-specific refinement task:

- **Geneticist:** "For each diagnosis, what's the inheritance pattern fit with the patient's family history? Note pedigree compatibility."
- **Cardiologist:** "For each cardiac-involving diagnosis, list the specific cardiac features expected and which the patient has / lacks."
- **Rheumatologist:** "For each connective tissue / autoimmune diagnosis, score it against ACR / EULAR classification criteria specifically."

Each specialist appends their domain-expert annotation to relevant hypotheses. The synth then sees not just KB criteria but expert per-domain commentary.

**Why high leverage:** This is what specialists are theoretically supposed to do but currently don't — they generate hypotheses but don't refine others. A "second pass" expert annotation per hypothesis is exactly the kind of structured precomputation that single-shot LLMs can't replicate.

**Risk:** Cost (11 more specialist calls per case), latency (sequential after evidence eval), prompt size. Validate that specialist-2-pass moves the needle before committing architecturally.

### 2E. Onset / natural history match (medium leverage)

**Idea:** Many rare diseases have characteristic age-of-onset distributions and natural history. KB profiles often have this; we don't currently surface "patient onset age = X; this disease typically presents at Y" as a structured per-hypothesis signal.

**Implementation:** Add an onset / natural-history fit indicator per hypothesis. Could be a numeric fit score + a flag for "atypical onset for this disease."

### 2F. Prevalence prior + demographic fit (low independent leverage)

**Idea:** Show base-rate prevalence and demographic match per hypothesis explicitly. e.g., "DEE4 prevalence ~1:100,000; M=F; typical onset 0-2 years. Patient is 6mo F → demographic fit: typical."

**Why low independent leverage:** LLMs already have this knowledge from training. The lift comes from forcing them to *use* it in their probability assignments — but they often will without prompting. Worth including if cheap, not worth investing in.

### 2G. Lab pattern signature per hypothesis (depends on lab data)

**Idea:** When the patient case includes lab data, each disease in the KB has expected lab patterns (e.g., low ceruloplasmin → Wilson's, characteristic lactic acidosis pattern → mito). Currently we have `lab-utils` with `mechanicallyCheckLabCriteria` and `deriveSymptomsFromLabs`, but the per-hypothesis lab-pattern fit isn't surfaced as a structured signal in the synth prompt.

**Why:** For lab-rich cases, this is highly discriminating. For symptom-only cases (the Phenopacket2Prompt cohort), it's a no-op. So value is bimodal — high when applicable.

### 2H. Time course / disease trajectory (lower leverage, harder data)

**Idea:** Some diseases have characteristic progression patterns (e.g., relapsing-remitting in MS, monophasic in ADEM). If the patient's clinical history includes temporal information, surface trajectory match per hypothesis.

**Why:** Likely useful for some cases, but KB data is uneven on trajectory characteristics. Lower priority unless we explicitly enrich the KB.

---

## Architectural concerns for Tier 2

Adding more data per hypothesis isn't free:

1. **Context budget.** Each enrichment block is +100-500 tokens per hypothesis. With 10 hypotheses, +1K-5K tokens per enrichment type. Stacking all the Tier 2 items would push the synth's prompt from ~5K to ~30K+ tokens. o3:high handles this but at latency cost (~30-60s additional reasoning time).

2. **Signal vs noise.** More structured data only helps if the LLM *uses* it. The v13 finding showed that even criteria fulfillment data was ignored when the LLM had latitude. v14's deterministic-label fix removes that latitude for one specific field; we may need similar enforcement on the others.

3. **Verification cost.** Every piece of pre-computed data must be CORRECT. Bad KB data is worse than missing data — it gives the LLM false confidence. Any Tier 2 enrichment that pulls from KB needs validation that the KB content is reliable.

4. **Measurement.** Each enrichment should be A/B tested individually. Adding everything at once obscures which parts help. The right test cadence is one Tier 2 item per release, measured on the 26-case replay + a fresh uniform N=50 cohort.

---

## Out-of-scope for v14

These are explicitly NOT in this plan, even though they were discussed in the v13 session:

- **Claude opus-4-7 as adversarial critic post-synth.** The v13 finding showed the bottleneck is *upstream* of synth ranking. Adding a critic on synth output doesn't address the structural information deficit. Revisit only if Tier 1 + 2 don't recover competitive performance.
- **Pinning OAI checkpoints.** Operationally risky; addresses one symptom (label drift) of many.
- **Family-cluster collapse as a synth pre-processor.** Subsumed by Tier 2B (sibling differentiation), which solves the same problem with less structural change.
- **Two-pass synth (family-then-subtype).** Heavier than needed if Tier 1 + 2B work. Reserve as Plan B.

---

## Success criteria for v14

**Tier 1 ships when:**
- Same NF1 ppkt_id shows criteria-grounded count ≥4 of 10 (matching v5 range)
- Same ADTKD-1 ppkt_id has only one ADTKD-MUC1 entry (no duplicates)
- The 26-case v14-recovery replay shows SL Top-1 ≥22/26 (matching v5 ± stochastic noise)

**Tier 2 success ships per-item when:**
- A/B comparison vs current v14-Tier-1 baseline on N=50 uniform cohort shows ≥3 pp Top-1 improvement OR ≥5 pp Top-3 improvement, on either the KB-favorable subset or the long tail
- Each item earns its place independently; no item ships on aggregate improvement of bundled items

**Strategic checkpoint after Tier 1 ships:**
- If SL Top-1 ≥ current OAI/CL on a fresh uniform N=50 cohort (not just the v13 replay cohort): we're back at "SL beats baselines" and Tier 2 is amplification.
- If SL Top-1 < baselines despite restored criteria coverage: the issue is deeper than label assignment, and the value proposition discussion (Top-1 accuracy vs explainability vs auditable evidence) becomes load-bearing before more code investment.
