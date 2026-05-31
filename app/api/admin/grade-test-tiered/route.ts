import { NextRequest, NextResponse } from 'next/server';

// Claude opus-4-7 reasoning:high can take 30-90s on cases with verbose
// engine outputs. 300s ceiling matches the existing testing endpoints.
export const maxDuration = 300;

import { z } from 'zod';
import { callAnthropic } from '@/lib/anthropic';
import type { GraderTier, TieredEntry, TieredGrading } from '@/lib/types/admin';

const inputSchema = z.object({
  groundTruth: z.object({
    diagnosis: z.string().min(1),
  }),
  // Engine's ranked top-N diagnoses. Up to 10 entries.
  differentialDiagnoses: z.array(z.object({
    diagnosis: z.string(),
  }).passthrough()).max(15),
});

const GRADER_SYSTEM_PROMPT = `You are a senior clinical geneticist with deep expertise across rare-disease nosology, gene-based naming conventions, eponyms, and historical disease classifications. You are grading an automated diagnostic system by comparing its ranked differential diagnosis against a ground-truth disease label.

For EACH ENTRY in the engine's ranked list, assign exactly one tier from this rubric:

EXACT — Same disease entity as the ground truth. Accept all of:
  • Synonyms ("Beals syndrome" = "Congenital contractural arachnodactyly")
  • Eponyms vs descriptive ("Parkinson's disease" = "Parkinson disease")
  • Gene-based vs phenotype-based ("UMOD-related ADTKD" = "Familial juvenile hyperuricemic nephropathy")
  • Modern vs historical naming
  • Punctuation/spacing/case variants
  • Adding clarifying parentheticals to the same disease (e.g., engine says
    "Neurofibromatosis Type 1 (NF1, von Recklinghausen disease)" — this is
    EXACT for ground truth "Neurofibromatosis type 1")
  The two strings refer to the same OMIM/Orphanet entity.

VARIANT — Engine names the parent UMBRELLA when the ground truth is a numbered
  subtype of that umbrella. Examples:
  • Engine "CVID" / ground truth "CVID-15" → VARIANT
  • Engine "Mitochondrial DNA depletion syndrome" / truth "Mito DNA Depletion 13" → VARIANT
  • Engine "Cornelia de Lange syndrome" / truth "CdLS-1" → VARIANT
  • Engine "ADTKD" / truth "ADTKD-1" → VARIANT
  This tier accepts the umbrella regardless of whether the case data supports
  specifying the subtype. The engine has identified the correct broader
  disease entity.

FAMILY — Engine names a DIFFERENT numbered/named member of the same parent
  disease as the ground truth. Both are specific subtypes of the same umbrella,
  but the engine picked the wrong one. Examples:
  • Engine "ADTKD-MUC1" / truth "ADTKD-UMOD" → FAMILY (both named members of ADTKD)
  • Engine "Mito DNA depletion 12" / truth "Mito DNA depletion 13" → FAMILY
  • Engine "CVID-13" / truth "CVID-15" → FAMILY
  This is NOT umbrella vs subtype — both engine output and ground truth are
  specific subtypes within the same parent disease.

SIBLING — Different disease in the same broad clinical category. Closely
  related phenotypically or by management but distinct disease entities not
  in the same parent disease family. Examples:
  • "Legius syndrome" / "Neurofibromatosis type 1" → SIBLING (different gene,
    different disease, closely-related phenotype)
  • "Unverricht-Lundborg disease (EPM1)" / "Lafora disease (EPM2)" → SIBLING
    (both PMEs, different genes, different diseases)
  • "22q11.2 deletion syndrome" / "SATB2-associated syndrome" → SIBLING
    (both neurodev, different gene, distinct disease entity)
  Use SIBLING when the diseases are clinically related but each has its own
  OMIM/Orphanet entity and they aren't variants of a shared parent.

UNRELATED — Different disease entirely. The engine's pick has no diagnostic
  relationship to the ground truth.

OUTPUT REQUIREMENTS:
- Return a tier for EVERY entry in the ranked list, in order.
- Each entry gets a brief one-sentence reasoning citing what placed it in
  that tier (e.g., "Same disease, accepted synonym" or "Wrong member of
  ADTKD family — engine said MUC1, truth is UMOD").
- Do NOT consider how confident the engine seemed or any clinical reasoning
  it provided. ONLY judge the diagnosis name itself against the ground truth.
- Be strict about FAMILY vs SIBLING: if the two diseases aren't both numbered
  members of the same parent umbrella, they are SIBLING at most, not FAMILY.

Return the structured tier assignments via the tool call.`;

interface ClaudeGraderEntry {
  position: number;
  engineOutput: string;
  tier: GraderTier;
  reasoning: string;
}

interface ClaudeGraderResponse {
  entries: ClaudeGraderEntry[];
  graderConfidence?: 'high' | 'medium' | 'low';
  graderNotes?: string;
}

function tierToScore(tier: GraderTier): number {
  switch (tier) {
    case 'EXACT': return 4;
    case 'VARIANT': return 3;
    case 'FAMILY': return 2;
    case 'SIBLING': return 1;
    case 'UNRELATED': return 0;
  }
}

function computeRankAtThreshold(entries: TieredEntry[], minTierScore: number): number | null {
  for (const e of entries) {
    if (tierToScore(e.tier) >= minTierScore) return e.position;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const requestId = `gradet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured', requestId },
      { status: 503 },
    );
  }

  let input;
  try {
    const body = await request.json();
    input = inputSchema.parse(body);
  } catch (error: any) {
    const message = error instanceof z.ZodError
      ? error.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join('; ')
      : 'Invalid request body';
    return NextResponse.json({ error: message, requestId }, { status: 400 });
  }

  const groundTruth = input.groundTruth.diagnosis;
  const diagnoses = input.differentialDiagnoses.slice(0, 10);

  if (diagnoses.length === 0) {
    return NextResponse.json(
      { error: 'No differential diagnoses provided', requestId },
      { status: 400 },
    );
  }

  // Build a tight user prompt — no patient context per design decision.
  const userPrompt = `GROUND TRUTH: ${groundTruth}

ENGINE'S RANKED DIFFERENTIAL (top ${diagnoses.length}):
${diagnoses.map((d, i) => `${i + 1}. ${d.diagnosis}`).join('\n')}

Assign a tier (EXACT, VARIANT, FAMILY, SIBLING, or UNRELATED) to EACH entry
above against the ground truth. Return via the emit_tiered_grading tool.`;

  const startTime = Date.now();

  // Anthropic tool-use schema. callAnthropic doesn't currently take tool
  // schemas, so we'll embed the structure instruction in the prompt and
  // parse JSON from the response. Claude opus-4-7 reasoning:high is very
  // reliable at structured JSON output when given a clear schema.
  const structureHint = `\n\nReturn your assessment as a single JSON object EXACTLY matching this
shape (no markdown fence, no surrounding prose):
{
  "entries": [
    { "position": 1, "engineOutput": "<verbatim>", "tier": "EXACT|VARIANT|FAMILY|SIBLING|UNRELATED", "reasoning": "<one-sentence>" },
    ...one entry per item in the ranked list, in order...
  ],
  "graderConfidence": "high|medium|low",
  "graderNotes": "<optional brief note on any ambiguity>"
}`;

  let claudeResult;
  try {
    claudeResult = await callAnthropic({
      systemPrompt: GRADER_SYSTEM_PROMPT,
      userPrompt: userPrompt + structureHint,
      maxTokens: 8000,
      model: 'claude-opus-4-7',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Grader call failed: ${err?.message || 'unknown'}`, requestId },
      { status: 502 },
    );
  }

  // Parse response — callAnthropic already attempts JSON.parse and handles
  // markdown fences. Validate the shape.
  let response: ClaudeGraderResponse;
  if (typeof claudeResult.content === 'object' && claudeResult.content !== null && 'entries' in claudeResult.content) {
    response = claudeResult.content as ClaudeGraderResponse;
  } else {
    return NextResponse.json(
      {
        error: 'Grader returned non-conforming output',
        rawText: claudeResult.rawText.slice(0, 500),
        requestId,
      },
      { status: 502 },
    );
  }

  // Validate each entry — guard against malformed tiers
  const validTiers: GraderTier[] = ['EXACT', 'VARIANT', 'FAMILY', 'SIBLING', 'UNRELATED'];
  const cleanedEntries: TieredEntry[] = [];
  for (const e of response.entries) {
    if (typeof e.position !== 'number' || !validTiers.includes(e.tier as GraderTier)) {
      continue; // skip malformed entries rather than failing the whole grade
    }
    cleanedEntries.push({
      position: e.position,
      engineOutput: e.engineOutput || '',
      tier: e.tier,
      reasoning: e.reasoning || '',
    });
  }
  cleanedEntries.sort((a, b) => a.position - b.position);

  if (cleanedEntries.length === 0) {
    return NextResponse.json(
      {
        error: 'Grader returned no valid entries',
        rawText: claudeResult.rawText.slice(0, 500),
        requestId,
      },
      { status: 502 },
    );
  }

  const rankAtExact = computeRankAtThreshold(cleanedEntries, tierToScore('EXACT'));
  const rankAtVariant = computeRankAtThreshold(cleanedEntries, tierToScore('VARIANT'));
  const rankAtFamily = computeRankAtThreshold(cleanedEntries, tierToScore('FAMILY'));
  const rankAtAny = computeRankAtThreshold(cleanedEntries, tierToScore('SIBLING'));

  const tieredGrading: TieredGrading = {
    gradingVersion: 'v3',
    entries: cleanedEntries,
    rankAtExact,
    rankAtVariant,
    rankAtFamily,
    rankAtAny,
    isTop1: rankAtVariant === 1, // headline: Top-1 = EXACT or VARIANT
    gradingModel: 'claude-opus-4-7',
    gradingDurationMs: Date.now() - startTime,
    gradingTokensUsed: claudeResult.tokensUsed,
    graderConfidence: response.graderConfidence,
    graderNotes: response.graderNotes,
    gradedAt: new Date().toISOString(),
  };

  return NextResponse.json({ tieredGrading, requestId });
}
