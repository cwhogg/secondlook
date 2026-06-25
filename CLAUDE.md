# SecondLook

AI-powered rare disease diagnostic tool. Patients input symptoms through a multi-step form, and a multi-agent AI pipeline generates differential diagnoses grounded in a curated knowledge base of ~1,200 rare diseases.

## Tech Stack

- **Framework**: Next.js 14 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS + Radix UI (shadcn/ui)
- **AI**: OpenAI API (GPT-4.1 for reasoning, GPT-4.1-nano/mini for classification/formatting), Anthropic API (Claude for test generation/grading)
- **Content**: MDX blog/FAQ system with gray-matter frontmatter
- **Validation**: Zod
- **Deployment**: Vercel

### AI Provider Separation (v17+ — per-stage instead of per-flow)

As of v17 (2026-05-31), the analysis flow uses both providers per-stage rather than the per-flow split that defined v5–v16. The testing framework remains Anthropic-only.

- **Analysis flow (mixed)**: triage + specialists + o3 critic use OpenAI; Claude evaluator + Claude synth (existing `ClaudeSynthAgent`) + Claude finalizer use Anthropic. Symptom/medication parsing remains OpenAI.
- **Testing framework (Anthropic only)**: `admin/generate-patient`, `admin/grade-test`, `admin/grade-test-tiered`. Unchanged.

**Rule:** keep the testing framework strictly Anthropic so testing activity cannot exhaust the OpenAI analysis quota. Inside the analysis flow, provider choice per stage is driven by which model fits the role (Claude for eval/synth/finalize per v17 architecture decision; o3 for specialists/critique).

Pre-v17 rule for reference: "Never mix providers" — formally relaxed by user decision on 2026-05-31. See `docs/v17-architecture.md` and `~/.claude/projects/-Users-cwhogg-SecondLook/memory/MEMORY.md`.

## Project Structure

```
app/
  page.tsx                    # Homepage
  step-1/page.tsx             # Demographics (age, biological sex)
  step-2/page.tsx             # Your history — narrative or medical document upload
  step-3/page.tsx             # Lab results — optional
  step-4/page.tsx             # Symptom photos — optional
  step-5/page.tsx             # Review extracted symptoms + timeline + severity + consent + submit
  analysis/page.tsx           # Loading screen during analysis
  results/analysis/page.tsx   # Results display
  testing/page.tsx            # Internal testing framework (generate cases, run pipeline, grade)
  blog/                       # Blog index + [slug] pages
  api/
    analyze-patient/          # V1 API (single-call, legacy)
    analyze-patient-v2/       # V2 API (multi-agent pipeline with SSE)
    parse-symptoms/           # Symptom text → SNOMED CT terms
    analyze-symptom-patterns/ # Symptom clustering
    parse-medications/        # Medication parsing
    umls-search/              # UMLS terminology lookup
    feedback/                 # User feedback
    admin/                    # Testing framework APIs (generate-patient, run-pipeline, grade-test)

lib/
  types/
    index.ts                  # Core types (PatientCase, AnalysisResult, etc.)
    knowledge-base.ts         # Disease profile types (DiseaseProfile, DiseaseMatch)
    admin.ts                  # Testing framework types (TestCase, TestGrading, GroundTruth)
    pipeline.ts               # Pipeline progress + SSE streaming types
  agents/
    base-agent.ts             # Abstract base class with OpenAI calling logic
    types.ts                  # Agent I/O types, specialist registry, body system mappings
    triage-agent.ts           # Stage 1: symptom classification + KB retrieval
    evidence-evaluator.ts     # Stage 3: criteria-grounded scoring
    synthesizer.ts            # Stage 4: reconcile specialist opinions
    report-generator.ts       # Stage 5: final report formatting
    specialist-agents/
      index.ts                # 11 specialist agents (see list below)
  knowledge/
    diseases/                 # ~1,200 JSON disease profiles
    index.ts                  # KB loader with caching + getDiseaseCount()
    retrieval.ts              # Symptom-to-disease matching engine
    validation.ts             # Zod schema for disease profiles
  pipeline/
    orchestrator.ts           # 5-stage pipeline coordinator + low-confidence escalation
    budget.ts                 # Cost tracking + limits
  umls-search.ts              # Shared UMLS search with intelligent fallback strategies
  env.ts                      # Environment variable validation
  content.ts                  # Blog/FAQ content loader
  markdown.ts                 # Markdown → HTML conversion
  utils.ts                    # cn() helper

components/
  ui/                         # shadcn/ui components (64+)
  symptom-mapping-section.tsx # Symptom parsing + UMLS mapping
  analysis-results.tsx        # Results display
  analysis-loading.tsx        # Loading state with progress
  (other form + layout components)

content/
  blog/                       # Markdown blog posts
  faq/                        # Markdown FAQ articles
  comparison/                 # Comparison articles
  landing-page/               # Landing pages
```

## Diagnostic Pipeline (V2)

The `/api/analyze-patient-v2` endpoint runs a 5-stage pipeline:

| Stage | Agent | Model | Purpose |
|-------|-------|-------|---------|
| 1. Triage | triage-agent | gpt-4.1-nano | Classify body systems, retrieve KB candidates, select specialists |
| 2. Specialists | 2-4 domain agents (parallel) | gpt-4.1 | Generate hypotheses with evidence mapped to patient symptoms |
| 3. Evidence Eval | evidence-evaluator | gpt-4.1 | Score hypotheses against diagnostic criteria from KB |
| 4. Synthesis | synthesizer | gpt-4.1 | Reconcile opinions, rank by evidence, identify gaps |
| 5. Report | report-generator | gpt-4.1-mini | Format final report with recommendations |

Key innovation: **Evidence scores are grounded in diagnostic criteria fulfillment**, not LLM self-assessed confidence.

### Low-Confidence Escalation

After synthesis, the orchestrator detects low-confidence scenarios (all top-5 scores < 40, weak/divergent consensus, or low reliability). When triggered, escalation context is injected into the report generator prompt, recommending broader investigative pathways (WES/WGS, geneticist referral, undiagnosed disease programs).

### Specialist Agents

11 specialists, each with domain-specific prompts and KB disease profiles:

| Specialist | Body Systems Routed |
|------------|-------------------|
| neurologist | neurological, ophthalmological |
| rheumatologist | musculoskeletal, dermatological, immunological, renal |
| cardiologist | cardiovascular |
| immunologist | respiratory, dermatological, immunological |
| endocrinologist | endocrine, reproductive |
| gastroenterologist | gastrointestinal |
| hematologist | hematological, oncological |
| psychiatrist | psychiatric |
| oncologist | oncological |
| geneticist | neurological, constitutional (always included — rare diseases are disproportionately genetic) |
| general-internist | constitutional, otolaryngological (always included, receives no KB profiles) |

## Knowledge Base

Disease profiles in `lib/knowledge/diseases/*.json` follow the `DiseaseProfile` schema:
- Diagnostic criteria (formal where they exist, with major/minor classification)
- Symptom tiers: pathognomonic (>90%), common (>50%), occasional (10-50%), rare (<10%)
- Each symptom has frequency percentages and body system classification
- Prevalence, demographics, differential diagnoses, red flags

The retrieval engine (`lib/knowledge/retrieval.ts`) uses multi-factor matching:
symptom overlap (weighted by tier) + body system overlap + demographic fit + prevalence prior.

Use `getDiseaseCount()` from `lib/knowledge/index.ts` for dynamic counts in prompts — never hardcode the number.

## Testing Framework

The `/testing` page provides an automated test harness:
1. **Generate** — LLM creates a synthetic patient case with ground truth diagnosis
2. **Run Pipeline** — Full V2 pipeline analyzes the generated case
3. **Grade** — LLM grades the pipeline output against ground truth

All three steps chain automatically via "Run New Test". Difficulty levels (1-5) are multi-dimensional, not purely prevalence-driven. Grading uses a 7-tier rubric with partial credit for correct disease category/organ system even when the exact diagnosis is missed.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # Production build
pnpm lint         # ESLint
```

## Environment Variables

```
OPENAI_API_KEY=    # Required — OpenAI API key
UMLS_API_KEY=      # Required for symptom validation — get from https://uts.nlm.nih.gov/uts/
```

See `.env.example` for all options.

## Working Principles

- **Verify before done**: Always run `pnpm build` after non-trivial changes. Never consider a task complete without proving it works.
- **Fix bugs autonomously**: When given a bug report, investigate root cause and fix it. Don't ask what to do — look at logs, errors, and code, then resolve.
- **Simplicity first**: Make every change as simple as possible. Minimal code impact. Find root causes — no temporary fixes or workarounds.
- **Minimal blast radius**: Changes should only touch what's necessary. Don't refactor surrounding code, add speculative features, or "improve" things that weren't asked for.
- **Plan for complex tasks**: For changes touching 3+ files or involving architectural decisions, use plan mode first. If something goes sideways mid-implementation, stop and re-plan rather than pushing through.
- **Challenge your own work**: Before presenting a fix, ask "is there a more elegant way?" For simple fixes, skip this — don't over-engineer.
- **Generalize, never specialize**: When fixing bugs or improving accuracy, never solve a problem specifically for one disease or disease group. All fixes must be general-purpose improvements to the pipeline, retrieval, or scoring logic that benefit all diseases equally.
- **Neutral analysis**: When comparing test results across versions or evaluating changes, be neutral, balanced, and analytical. Report numbers without spin. Don't frame regressions as improvements, don't cherry-pick favorable metrics, and don't editorialize with optimistic language. Let the data speak — if results are worse, say so plainly. Small sample sizes should be noted as a limitation, not used to justify conclusions in either direction.
- **Total honesty and objectivity**: Always be completely honest and objective. Never tell me what I want to hear. If a change made things worse, say so directly. If results are inconclusive, say that. Never sugarcoat, hedge to avoid delivering bad news, or selectively present information to paint a rosier picture. I need accurate information to make good decisions.

## Conventions

- **Types**: All shared types live in `lib/types/`. Don't define inline types for API responses.
- **Agents**: Extend `BaseAgent` class. Use `callWithTools()` for structured output, `callPlain()` for JSON mode.
- **Disease profiles**: One JSON file per disease in `lib/knowledge/diseases/`. Must pass Zod validation in `lib/knowledge/validation.ts`.
- **Content**: Markdown in `content/{type}/` with YAML frontmatter. Status must be `published` to appear on site.
- **Components**: shadcn/ui components in `components/ui/`. Custom components at `components/` root.
- **API routes**: Use Zod for input validation. Return `requestId` in all responses.
- **UMLS mapping**: Use `searchUMLSWithFallbacks()` from `lib/umls-search.ts` — never write inline UMLS search logic.

## Important Notes

- The V1 analysis endpoint (`/api/analyze-patient`) is a single GPT-4o call — kept as fallback
- The V2 pipeline streams progress via SSE (Server-Sent Events)
- Per-analysis budget cap is $2.00 by default (configurable via `ANALYSIS_BUDGET_CENTS`)
- Patient data is stored in `localStorage`/`sessionStorage` only — no server-side persistence
- Disease profile `confidenceInData` field tracks whether data has been human-reviewed
- General-internist is always included in specialist panel and receives no KB profiles (un-anchored counterweight)
- Geneticist is always included in specialist panel (rare diseases are disproportionately genetic in origin)
- Evidence evaluator uses two-track scoring: KB diseases against structured criteria, non-KB via clinical reasoning quality
