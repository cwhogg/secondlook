# SecondLook Pipeline — High-Level Data Flow

**Purpose:** reference diagram of how a patient case flows through the V2 diagnostic pipeline, where each LLM is called, and every point at which the KB is read.

**Companion docs:**
- `docs/v14-next-version-plan.md` — planned changes (Tier 1 + Tier 2 items map onto this diagram)
- `docs/session-reports/2026-05-30-v13-replay-o3-drift.md` — the v13 investigation that produced the v14 plan
- `CLAUDE.md` — project overview

---

## End-to-end flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│ INPUT                                                                     │
├──────────────────────────────────────────────────────────────────────────┤
│ Real patient: step-1/2/3 forms     |   Eval case: Phenopacket2Prompt     │
│  • demographics, chief complaint    |    free-text clinical vignette      │
│  • free-text symptom narrative      |    (en.jsonl, 9,587 cases)          │
│  • medical / family / med history   |                                     │
│  • optional lab results             |                                     │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ EXTRACTION (concept mapping)                                              │
├──────────────────────────────────────────────────────────────────────────┤
│ /api/parse-symptoms             ┐                                         │
│   [LLM #1: gpt-4.1-mini]        │  Produces: symptoms[], excludedFindings │
│                                 │  Each entry: originalPhrase, medicalTerm│
│ searchUMLSWithFallbacks()       ┤                                         │
│   [external UMLS API]           │  Adds: selectedConcept (UMLS CUI)       │
│                                 ┘                                         │
│ ⚠ Extraction is qualitative — counts, sizes, locations, modality often   │
│   lost. KB criteria are quantitative. This is the v14 Tier 2 gap.        │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
                       PatientCase {
                         symptoms: MappedSymptom[]
                         excludedFindings: MappedSymptom[]
                         demographics, history, labs
                       }
                                       ↓
╔══════════════════════════════════════════════════════════════════════════╗
║ PIPELINE — orchestrator.ts                                                ║
╚══════════════════════════════════════════════════════════════════════════╝
                                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 1 — TRIAGE                          [LLM #2: gpt-4.1-nano]          │
├──────────────────────────────────────────────────────────────────────────┤
│ In:  PatientCase                                                          │
│ Out: bodySystems[], selectedSpecialists[], candidateDiseases[]            │
│                                                                           │
│ ◆ KB TOUCH 1 — findMatchingDiseases()                                    │
│   ~9,263 disease profiles → multi-pass retrieval:                         │
│     • symptom-overlap scoring weighted by symptom tier                   │
│     • body-system filter + unfiltered fallback at strict 0.10 threshold  │
│     • patient-coverage blending                                           │
│   → 30-50 DiseaseProfile candidates with matchScore                       │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 2 — SPECIALIST CONSULTATION   [LLM #3-#7: o3 reasoning=high]       │
│                                      (2-4 specialists + geneticist        │
│                                       + general-internist, parallel)      │
├──────────────────────────────────────────────────────────────────────────┤
│ Per specialist:                                                           │
│   rerankCandidatesForSpecialty(candidates, specialty)                     │
│     → its slice of candidates, sorted by domain fit                      │
│                                                                           │
│ Each specialist sees:                                                     │
│   • PatientCase                                                           │
│   • Its DiseaseProfile candidates  ◆ KB TOUCH 2                          │
│     (criteria text, symptom tiers, prevalence, demographics)              │
│                                                                           │
│ Out: DiagnosisHypothesis[] per specialist                                 │
│   (3-10 hypotheses, each with rationale + supporting evidence)            │
│                                                                           │
│ ⚠ v13: specialists produce verbose names ("(NF1, von Recklinghausen)")   │
│   v14 Tier 1B: prompt constraint to use KB-canonical names verbatim      │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
                         merge + deduplicate hypotheses
                                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 3 — EVIDENCE EVALUATION       [LLM #8: o3 reasoning=high]          │
├──────────────────────────────────────────────────────────────────────────┤
│ Pre-LLM (deterministic):                                                  │
│   classifyHypotheses() → match each hypothesis name to KB profile         │
│     ◆ KB TOUCH 3 — loadDiseaseDatabase() full-KB fallback                │
│     → { hypothesis, kbMatch: DiseaseProfile | null }                     │
│                                                                           │
│ Prompt to o3:                                                             │
│   • PatientCase symptoms + excludedFindings                              │
│   • Each hypothesis tagged [KB MATCH: <name>] or [NOT IN KB]             │
│   • Criteria reference block for KB-matched diseases  ◆ KB TOUCH 4       │
│   • Subtype/family context  ◆ KB TOUCH 5 — findFamilySiblings()         │
│                                                                           │
│ o3 produces per hypothesis:                                               │
│   • criteriaFulfillment.criteriaDetails (per-criterion MET/UNMET)        │
│   • evidenceQuality, strengthAssessment, informationGaps                 │
│   • evaluationType: criteria-grounded | reasoning-evaluated              │
│                                                                           │
│ ★ v13 BUG: o3 overrides [KB MATCH] annotation, labels everything          │
│   reasoning-evaluated. NF1 case: 5/10 criteria-grounded in v5 → 0/10     │
│ ★ v14 Tier 1A FIX: set isKbMatch from kbMatch deterministically,          │
│   stripping LLM's discretion on the label                                 │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 4 — SYNTHESIS                  [LLM #9: o3 reasoning=high]          │
├──────────────────────────────────────────────────────────────────────────┤
│ In: evaluatedHypotheses (with full criteria + evidence enrichment)        │
│                                                                           │
│ Prompt shows o3 per hypothesis:                                           │
│   • [KB-MATCHED | NON-KB]  [criteria-grounded | reasoning-evaluated]     │
│   • Source specialist(s), specialist confidence                          │
│   • Evidence quality, criteria N/M met (%), per-criterion checklist     │
│   • Supporting + contradictory evidence with patient-symptom anchors    │
│   • Information gaps, contradictions, clinical reasoning narrative      │
│                                                                           │
│ o3 produces:                                                              │
│   • 10 ranked diagnoses with probabilityScore (0-100)                    │
│   • differentialClusters (phenotypic sibling groups)                     │
│   • consensusLevel, criticalGaps, excludedCommonDiagnoses                │
│                                                                           │
│ Server-side (synthesizer.ts:185+):                                        │
│   • evidenceScore = h.confidenceScore = probabilityScore                  │
│   • computeMechanicalEvidenceScore() — persisted as raw audit data       │
│     ◆ KB TOUCH 6 — findDiseaseByName() for criteria denominator         │
│     (NOT used for ranking since v10 revert)                              │
│   • Re-sort by evidenceScore desc (no-op when synth returns sorted)      │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
           Low-confidence escalation check (orchestrator)
        ▸ all top-5 scores < 40 OR weak/divergent consensus
        ▸ → injects escalation context into report prompt
                                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ STAGE 5 — REPORT GENERATION         [LLM #10: gpt-4.1-mini]              │
├──────────────────────────────────────────────────────────────────────────┤
│ In: ranked diagnoses + criteria + escalation context (if triggered)       │
│ Out: AnalysisResult with recommendedTesting, nextSteps, overallAssessment │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ POST — FAMILY EXPANSION (deterministic, no LLM)                          │
├──────────────────────────────────────────────────────────────────────────┤
│ expandFamilyVariants() walks top diagnoses, looks up each in KB,          │
│   appends ≤5 sibling variants at positions 11-15                         │
│   ◆ KB TOUCH 7 — findDiseaseByName() + getDiseaseById()                  │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       ↓
                              AnalysisResult →
                       differentialDiagnoses[15],
                       differentialClusters, escalation,
                       pipelineMetadata (stages, tokens, $)
```

---

## LLM call inventory per analysis

10 calls minimum (more with multiple specialists).

| # | Stage | Model | Effort | Purpose |
|---|---|---|---|---|
| 1 | Extraction | gpt-4.1-mini | — | parse symptoms from free text |
| 2 | Triage | gpt-4.1-nano | — | classify body systems, pick specialists |
| 3-7 | Specialists (×N) | o3 | high | hypothesis generation per domain |
| 8 | Evidence eval | o3 | high | criteria checking + per-hypothesis evaluation |
| 9 | Synthesis | o3 | high | final ranking + clustering |
| 10 | Report | gpt-4.1-mini | — | recommendations + narrative |

Verify against code — model assignments change. Source of truth:
- `lib/agents/specialist-agents/index.ts`
- `lib/agents/evidence-evaluator.ts`
- `lib/agents/synthesizer.ts`
- `lib/agents/report-generator.ts`
- `lib/agents/triage-agent.ts`

---

## KB touchpoints

The knowledge base (~9,263 disease profiles in `lib/knowledge/diseases/*.json`) is read at seven distinct points in the flow:

| # | Where | Function | What it produces |
|---|---|---|---|
| 1 | Triage retrieval | `findMatchingDiseases()` | multi-pass symptom-overlap scoring → candidate pool of 30-50 |
| 2 | Specialist prompts | `DiseaseProfile[]` passed in | criteria text, symptom tiers, prevalence, demographics |
| 3 | Evidence evaluator pre-LLM | `loadDiseaseDatabase()` + `matchesDiseaseProfile()` | deterministic KB-match classification per hypothesis |
| 4 | Evidence evaluator prompt | criteria block injection | reference text the LLM checks against |
| 5 | Evidence evaluator prompt | `findFamilySiblings()` | subtype context block per disease family |
| 6 | Synthesizer (audit) | `findDiseaseByName()` | mechanical evidence-score computation (audit-only, not rank) |
| 7 | Family expansion | `findDiseaseByName()` + `getDiseaseById()` | sibling variants appended at positions 11-15 |

The KB matcher (`matchesDiseaseProfile`) uses bidirectional substring matching on normalized strings (lowercase, alphanumeric-only). See `lib/agents/evidence-evaluator.ts:298`.

---

## Data shapes between stages

```
PatientCase
  ↓ (Stage 1)
+ TriageResult { bodySystems, selectedSpecialists, candidateDiseases: DiseaseMatch[] }
  ↓ (Stage 2 — parallel)
+ specialistResults: AgentOutput[] {
    hypotheses: DiagnosisHypothesis[] {
      diagnosis, confidenceScore, supportingEvidence[], contradictoryEvidence[],
      clinicalReasoning, sourceAgent, ...
    }
  }
  ↓ merge + dedup
+ evaluationResult: AgentOutput {
    hypotheses: DiagnosisHypothesis[] now enriched with:
      diagnosticCriteria { criteriaName, totalCriteria, metCriteria, criteriaDetails[] },
      evaluationType, knowledgeBaseMatch, _evidenceQuality, _strengthAssessment
  }
  ↓ (Stage 4)
+ synthesisResult: ranked top-10 with probabilityScore
  ↓ (Stage 5 + Post)
= AnalysisResult { differentialDiagnoses[15], clusters, recommendations, metadata }
```

Core types in `lib/types/index.ts`, `lib/types/knowledge-base.ts`, `lib/types/pipeline.ts`.

---

## Where each v14 plan item lives in the flow

| Plan item | Where in pipeline | What changes |
|---|---|---|
| **Tier 1A** — force `isKbMatch` deterministically | Stage 3, post-LLM label assignment | one line at `evidence-evaluator.ts:242`; `applyEvaluation` needs `classified[]` lookup |
| **Tier 1B** — specialist naming constraint | Stage 2, specialist system prompt | add rule to use KB-canonical names verbatim, no parentheticals |
| **Tier 1C** — KB-canonical-name dedup | between merge and Stage 3 | extend `deduplicateHypotheses()` to canonicalize via KB lookup first |
| **Tier 2A** — negative evidence per hypothesis | Stage 4 prompt enrichment | use KB symptom tiers + patient excludedFindings to compute pathognomonic-features-explicitly-lacking, surface per hypothesis |
| **Tier 2B** — sibling differentiation context | Stage 4 prompt enrichment | promote KB TOUCH 5 (currently evaluator-only) into synth prompt; include the `differentialDiagnoses[].distinguishingFeatures` from each top hypothesis's KB profile |
| **Tier 2C** — differentiating tests per pair | Stage 4 prompt enrichment / report | use existing `computeDifferentiatingTests()`, surface per pair not just per cluster |
| **Tier 2D** — per-specialist refinement pass | NEW Stage 2.5 between dedup and Stage 3 | each relevant specialist annotates the consolidated hypothesis list with domain-specific evaluation criteria |
| **Tier 2E** — onset / natural-history match | Stage 4 prompt enrichment | compare patient's onset age + demographics with KB profile's `demographics.typicalOnsetAge` |
| **Tier 2F** — prevalence + demographic fit | Stage 4 prompt enrichment | explicit per-hypothesis prior + demographic match (currently embedded in retrieval score only) |
| **Tier 2G** — lab pattern signature per hypothesis | Stage 3 prompt + Stage 4 enrichment | expand `mechanicallyCheckLabCriteria` to surface per-hypothesis lab-pattern fit when labs present |
| **Tier 2H** — time course / trajectory | Stage 4 prompt enrichment | per-hypothesis trajectory fit if history includes temporal data; depends on KB enrichment |
| **Tier 2I** — input-criteria matching | Extraction stage + Stage 3 schema | extract quantifications / locations / modality during parse-symptoms; add UNKNOWN to criterion status; deterministic patient-symptom-to-criterion pre-matching |

---

## Provider boundaries (strict)

| Boundary | Provider | Endpoints |
|---|---|---|
| **Analysis flow** | OpenAI | parse-symptoms, analyze-symptom-patterns, parse-medications, V2 pipeline (all agents) |
| **Testing framework** | Anthropic | admin/generate-patient, admin/grade-test |

Never mix providers across this boundary. Analysis must use OpenAI; testing must use Anthropic. Keeps API quotas independent so testing activity cannot cause rate limits in the production analysis flow.

This is also why the eval baseline calls (`/api/admin/eval-baseline`) split:
- `evalRunMode: 'openai'` → single-shot OpenAI o3
- `evalRunMode: 'claude'` → single-shot Anthropic Claude opus-4-7
- `evalRunMode: 'secondlook'` → full V2 pipeline (OpenAI-only internally)
