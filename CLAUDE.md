# SecondLook

AI-powered rare disease diagnostic tool. Patients input symptoms through a multi-step form, and a multi-agent AI pipeline generates differential diagnoses grounded in a curated knowledge base of ~1,200 rare diseases.

## Tech Stack

- **Framework**: Next.js 14 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS + Radix UI (shadcn/ui)
- **AI**: OpenAI API (GPT-4o for reasoning, GPT-4o-mini for classification/formatting)
- **Content**: MDX blog/FAQ system with gray-matter frontmatter
- **Validation**: Zod
- **Deployment**: Vercel

## Project Structure

```
app/
  page.tsx                    # Homepage
  step-1/page.tsx             # Demographics + chief complaint
  step-2/page.tsx             # Symptom mapping + medical history
  step-3/page.tsx             # Medications, testing, consent
  analysis/page.tsx           # Loading screen during analysis
  results/analysis/page.tsx   # Results display
  blog/                       # Blog index + [slug] pages
  api/
    analyze-patient/          # V1 API (single-call, legacy)
    analyze-patient-v2/       # V2 API (multi-agent pipeline with SSE)
    parse-symptoms/           # Symptom text → SNOMED CT terms
    analyze-symptom-patterns/ # Symptom clustering
    parse-medications/        # Medication parsing
    umls-search/              # UMLS terminology lookup
    feedback/                 # User feedback

lib/
  types/
    index.ts                  # Core types (PatientCase, AnalysisResult, etc.)
    knowledge-base.ts         # Disease profile types (DiseaseProfile, DiseaseMatch)
  agents/
    base-agent.ts             # Abstract base class with OpenAI calling logic
    types.ts                  # Agent I/O types, specialist registry
    triage-agent.ts           # Stage 1: symptom classification + KB retrieval
    evidence-evaluator.ts     # Stage 3: criteria-grounded scoring
    synthesizer.ts            # Stage 4: reconcile specialist opinions
    report-generator.ts       # Stage 5: final report formatting
    specialist-agents/
      index.ts                # 9 specialist agents (neuro, rheum, cardio, etc.)
  knowledge/
    diseases/                 # ~1,200 JSON disease profiles
    index.ts                  # KB loader with caching
    retrieval.ts              # Symptom-to-disease matching engine
    validation.ts             # Zod schema for disease profiles
  pipeline/
    orchestrator.ts           # 5-stage pipeline coordinator
    budget.ts                 # Cost tracking + limits
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
| 1. Triage | triage-agent | gpt-4o-mini | Classify body systems, retrieve KB candidates, select specialists |
| 2. Specialists | 2-4 domain agents (parallel) | gpt-4o | Generate hypotheses with evidence mapped to patient symptoms |
| 3. Evidence Eval | evidence-evaluator | gpt-4o | Score hypotheses against diagnostic criteria from KB |
| 4. Synthesis | synthesizer | gpt-4o | Reconcile opinions, rank by evidence, identify gaps |
| 5. Report | report-generator | gpt-4o-mini | Format final report with recommendations |

Key innovation: **Evidence scores are grounded in diagnostic criteria fulfillment**, not LLM self-assessed confidence.

## Knowledge Base

Disease profiles in `lib/knowledge/diseases/*.json` follow the `DiseaseProfile` schema:
- Diagnostic criteria (formal where they exist, with major/minor classification)
- Symptom tiers: pathognomonic (>90%), common (>50%), occasional (10-50%), rare (<10%)
- Each symptom has frequency percentages and body system classification
- Prevalence, demographics, differential diagnoses, red flags

The retrieval engine (`lib/knowledge/retrieval.ts`) uses multi-factor matching:
symptom overlap (weighted by tier) + body system overlap + demographic fit + prevalence prior.

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

## Conventions

- **Types**: All shared types live in `lib/types/`. Don't define inline types for API responses.
- **Agents**: Extend `BaseAgent` class. Use `callWithTools()` for structured output, `callPlain()` for JSON mode.
- **Disease profiles**: One JSON file per disease in `lib/knowledge/diseases/`. Must pass Zod validation in `lib/knowledge/validation.ts`.
- **Content**: Markdown in `content/{type}/` with YAML frontmatter. Status must be `published` to appear on site.
- **Components**: shadcn/ui components in `components/ui/`. Custom components at `components/` root.
- **API routes**: Use Zod for input validation. Return `requestId` in all responses.

## Important Notes

- The V1 analysis endpoint (`/api/analyze-patient`) is a single GPT-4o call — kept as fallback
- The V2 pipeline streams progress via SSE (Server-Sent Events)
- Per-analysis budget cap is $1.00 by default (configurable via `ANALYSIS_BUDGET_CENTS`)
- Patient data is stored in `localStorage`/`sessionStorage` only — no server-side persistence
- Disease profile `confidenceInData` field tracks whether data has been human-reviewed
