/**
 * v17 Stage 8 — Claude finalize.
 *
 * Claude is the final decider for the v17 pipeline. Takes the patient case,
 * Claude's own Stage 6 synthesizer ranking, and o3's Stage 7 critique.
 * Reviews each critique suggestion and produces a final top-10 differential
 * with `changesFromFirstPass` annotations so the report layer can show what
 * actually changed.
 *
 * Reasoning effort: 'medium' (not 'high'). This is a review-and-decide task,
 * not from-scratch synthesis — Claude already did the analytical heavy lifting
 * in Stage 6. Medium reasoning saves ~$0.20/case on the common
 * high-agreement-with-critique majority.
 *
 * Goal: preserve the high-value original synth ranking when critique
 * confidence is high; selectively apply critique suggestions when they cite
 * specific evidence the original ranking under-weighted.
 */
import type { AgentOutput } from './types';
import type { DiagnosisHypothesis, PatientCase, CritiqueOutput, CritiqueSuggestion, FamilyEnrichment } from '../types';
import { callAnthropic } from '../anthropic';
import { setLogContext } from '../pipeline/llm-call-log';
import { loadDiseaseDatabase } from '../knowledge';

const CLAUDE_FINALIZER_MODEL = 'claude-opus-4-7';

const CLAUDE_FINALIZER_SYSTEM_PROMPT = `You are a senior clinical diagnostician finalizing a differential diagnosis ranking. You produced a draft FULL ranking of all evaluated hypotheses, and another senior clinician has reviewed it and provided specific evidence-cited critique suggestions. Your job now is to SELECT the final top-10 — the differential the patient sees — from your full draft ranking, incorporating the critic's input where the cited evidence justifies it.

Your task: REVIEW each suggestion, decide whether to honor it, and SELECT the final top-10 from your draft ranking (which may have more than 10 entries). You are the final decider — the critique is input to your judgment, not a mandate. The cap of 10 is firm; entries you do not include in the final 10 are dropped from the patient-facing differential.

DECISION PRINCIPLES:
- Honor critique suggestions ONLY when the cited patient evidence actually supports the recommended change. Do not honor a suggestion just because the critic was confident.
- Reject suggestions when the cited evidence is weak or the proposed rank change would put a poorly-supported diagnosis above a well-supported one.
- DO NOT reject suggestions on prevalence grounds alone. This pipeline is specifically for rare-disease diagnosis — the correct answer is frequently a rare disease that would lose to a common neighbor on prevalence-bias alone. Weight evidence, not commonality.
- Selection is more important than reordering within the top: getting the right 10 in any plausible order beats getting the wrong 10 in the perfect order. Use your full draft ranking + the critic's input to decide which 10 belong.
- For 'add' suggestions (a diagnosis NOT in your draft ranking at all): the bar is high. Accept only when the critic cites specific patient findings that materially support the new diagnosis AND the cited evidence is stronger than the entry it would displace. When you accept an 'add', use 'critique-added' as the changeReason.
- When the critic raised an information gap, decide whether it materially affects the ranking and reflect that in your final assessment.
- Preserve KB-matched and reasoning-evaluated diagnoses on equal terms.

FAMILY-AWARE REASONING (v25):
When the input includes a FAMILY ANALYSIS block, multiple top-ranked hypotheses belong to the same disease family with several subtypes. Use this information to make better umbrella-vs-subtype decisions:
- If the patient case carries SUBTYPE-DISTINGUISHING evidence (a feature unique to one numbered/gene-keyed subtype per the family analysis), commit to that subtype.
- If the patient case has NO subtype-distinguishing evidence (the hypotheses are indistinguishable by clinical features alone), prefer the UMBRELLA name over a confidently-named subtype. A confident wrong-gene call ("Loeys-Dietz syndrome type 2 (TGFBR2)" when no TGFBR2 evidence exists) sends physicians on a tangent. Use 'finalizer-override' as the changeReason and explain in rationale.
- If multiple subtypes from the same family are spread across the top-10 with similar scores AND the case cannot distinguish them, consider consolidating to a single umbrella entry at higher rank. This frees ranking slots for genuinely different hypotheses. Use 'finalizer-override' as the changeReason.
- This guidance is informational; do NOT mechanically collapse every family — preserve subtype specificity when evidence supports it.

For EACH entry in your final top-10, record:
- final rank
- whether the rank changed from your Stage 6 first-pass ranking
- the reason for change (or 'no-change' if preserved)

OUTPUT FORMAT (return as JSON, no markdown fences):
{
  "rankedDiagnoses": [
    {
      "diagnosis": "<EXACT name from the input hypothesis pool, OR the new diagnosis name when accepting a critic 'add' suggestion>",
      "probabilityScore": <0-100>,
      "rationale": "<one to three sentences>",
      "changeReason": "no-change" | "critique-promoted" | "critique-demoted" | "critique-reordered" | "critique-added" | "finalizer-override"
    }
  ],
  "overallAssessment": "<paragraph summarizing the final differential>",
  "criticSuggestionsAccepted": <integer count>,
  "criticSuggestionsRejected": <integer count>,
  "finalizerNotes": "<optional brief notes on critique acceptance/rejection rationale>"
}`;

function buildPatientRecap(patientCase: PatientCase): string {
  const symptoms = patientCase.symptoms
    .slice(0, 20)
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');
  const chief = patientCase.chiefComplaint?.description || '';
  return `PATIENT: ${patientCase.demographics.age}yo ${patientCase.demographics.sex}.${chief ? ` Chief complaint: ${chief}.` : ''}
Symptoms: ${symptoms}.`;
}

function buildRankingBlock(ranking: DiagnosisHypothesis[]): string {
  // v17+ widened funnel: synth ranks ALL evaluated hypotheses. Show the
  // finalizer the full list so it can promote a strong rank-15 entry into
  // the final top-10 if the critic justified it.
  return ranking.map((h, i) => {
    const cf = h.diagnosticCriteria;
    const fulfillment = cf && cf.totalCriteria > 0
      ? `criteria ${cf.metCriteria}/${cf.totalCriteria}`
      : 'no criteria fulfillment';
    const evalTag = h.knowledgeBaseMatch ? 'KB-MATCHED' : 'NON-KB';
    return `#${i + 1} ${h.diagnosis} [${evalTag}, ${fulfillment}, confidence ${h.confidenceScore}]
  ${(h.clinicalReasoning || '').slice(0, 400)}`;
  }).join('\n\n');
}

function buildCritiqueBlock(critique: CritiqueOutput): string {
  if (!critique.suggestions.length) {
    return `OTHER CLINICIAN'S CRITIQUE: ${critique.overallAssessment || 'No specific suggestions; ranking is acceptable.'} (Confidence in your ranking: ${critique.confidenceInClaudeRanking}/100)`;
  }
  const suggestions = critique.suggestions.map((s, i) => {
    const rankPart = s.targetNewRank ? ` (suggest new rank: #${s.targetNewRank})` : '';
    const evidenceList = s.evidence.length ? `\n    Evidence cited: ${s.evidence.join('; ')}` : '';
    return `${i + 1}. ${s.action.toUpperCase()} "${s.targetDiagnosis}"${rankPart}
    Reasoning: ${s.reasoning}${evidenceList}`;
  }).join('\n');
  return `OTHER CLINICIAN'S CRITIQUE (confidence in your ranking: ${critique.confidenceInClaudeRanking}/100):
Overall: ${critique.overallAssessment}

Specific suggestions:
${suggestions}`;
}

function buildFamilyBlock(familyEnrichments?: FamilyEnrichment[]): string {
  if (!familyEnrichments || familyEnrichments.length === 0) return '';
  const lines = familyEnrichments.map((fe) => {
    const dt = fe.differentiatingTest;
    if (!dt) {
      return `Family "${fe.familyName}" — anchor diagnosis: "${fe.topDiagnosisInFamily}" (${fe.totalSubtypes} subtypes in KB)
  No single differentiating test identified (mixed modalities). Subtype distinction requires multiple investigations.`;
    }
    const perSubtype = dt.perSubtype
      .filter((s) => s.uniqueFindings && s.uniqueFindings.length > 0)
      .slice(0, 6)
      .map((s) => `    - ${s.diseaseName}: ${s.uniqueFindings.slice(0, 3).join('; ')}`)
      .join('\n');
    const shared = dt.sharedFindings && dt.sharedFindings.length > 0
      ? `\n  Shared across the family: ${dt.sharedFindings.slice(0, 4).join('; ')}`
      : '';
    return `Family "${fe.familyName}" — anchor diagnosis: "${fe.topDiagnosisInFamily}" (${fe.totalSubtypes} subtypes in KB)
  Differentiating test: ${dt.modalityLabel} (convergence ratio ${Math.round((dt.convergenceRatio || 0) * 100)}%)
  Per-subtype distinguishing features:
${perSubtype}${shared}`;
  });
  return `FAMILY ANALYSIS (v25): the following top-ranked hypotheses belong to disease families with multiple subtypes. Use the per-subtype features below to judge whether the patient case actually supports a specific subtype, or whether the umbrella is the more honest call.

${lines.join('\n\n')}`;
}

function buildUserPrompt(opts: {
  patientCase: PatientCase;
  firstPassRanking: DiagnosisHypothesis[];
  firstPassAssessment?: string;
  critique: CritiqueOutput;
  familyEnrichments?: FamilyEnrichment[];
}): string {
  const recap = buildPatientRecap(opts.patientCase);
  const ranking = buildRankingBlock(opts.firstPassRanking);
  const critique = buildCritiqueBlock(opts.critique);
  const family = buildFamilyBlock(opts.familyEnrichments);
  const firstPassNote = opts.firstPassAssessment
    ? `\nYour Stage 6 overall assessment:\n${opts.firstPassAssessment}\n`
    : '';
  return `${recap}

YOUR DRAFT RANKING (Stage 6, the one being critiqued):

${ranking}
${firstPassNote}
${critique}
${family ? '\n' + family + '\n' : ''}
Now produce your final ranked top-10. For each entry: explicitly note whether the rank changed from your draft, and why. Honor critique suggestions only when the cited evidence supports the change.`;
}

export interface ClaudeFinalizerOutput extends AgentOutput {
  finalizerStats: {
    criticSuggestionsAccepted: number;
    criticSuggestionsRejected: number;
    rankChangesFromFirstPass: number;
    removedFromTop10: string[];
    addedToTop10: string[];
    // v24: when the gene-evidence post-process rewrote top-1, record what
    // changed. Absent = no rewrite. Telemetry only — top-1 already updated
    // in-place in hypotheses[].
    geneRewrite?: {
      fromName: string;
      toName: string;
      gene: string;
      candidatesConsidered: number;
    };
  };
}

// ===== v24: Gene-evidence-driven top-1 name rewrite =====
//
// The v23.1 EXACT-Top-1 grader audit showed 12/12 misses were "engine names
// the umbrella, GT is the numbered/gene-specific subtype." When the patient
// case mentions a specific gene mutation AND the hypothesis pool contains a
// KB-linked variant whose name encodes that gene, the umbrella at rank 1 is
// almost certainly the wrong specificity.
//
// This rewrite runs deterministically AFTER the LLM finalizer's selection.
// It only fires when ALL of:
//   - Top-1 is an umbrella that does NOT already encode a gene
//   - Patient case text contains a token matching a known KB gene symbol
//   - The pool contains exactly one variant sharing top-1's distinctive
//     tokens AND containing that gene in its name
// Single unique match required — ambiguous evidence falls through unchanged.

const KB_GENE_FALSE_POSITIVES = new Set([
  'MRI', 'CT', 'EEG', 'ECG', 'EKG', 'PET', 'CSF', 'WBC', 'RBC', 'CRP', 'ESR',
  'GFR', 'BUN', 'TSH', 'PTH', 'FSH', 'IGG', 'IGM', 'IGA', 'IGE', 'HIV', 'EBV',
  'CMV', 'HSV', 'HPV', 'XX', 'XY', 'XXY', 'XYY', 'XXX', 'XXYY', 'XXXY', 'XYYY',
  'XXXX', 'XXXXY', 'IQ', 'BMI', 'MMSE', 'COPD', 'CHF',
]);

const DISEASE_NAME_STOPWORDS_FINALIZER = new Set([
  'syndrome', 'syndromes', 'disease', 'disorder', 'disorders', 'deficiency',
  'dystrophy', 'with', 'and', 'or', 'the', 'of', 'in', 'on', 'an', 'for',
  'type', 'types', 'complex', 'related', 'variant', 'variants', 'familial',
  'hereditary', 'autosomal', 'dominant', 'recessive', 'x-linked', 'congenital',
  'progressive', 'idiopathic', 'sporadic', 'primary', 'secondary',
]);

let cachedKbGeneSet: Set<string> | null = null;
function getKbGeneSet(): Set<string> {
  if (cachedKbGeneSet) return cachedKbGeneSet;
  const db = loadDiseaseDatabase();
  const out = new Set<string>();
  const re = /\b[A-Z][A-Z0-9]{2,7}\b/g;
  for (const d of db) {
    const text = `${d.name} ${(d.aliases || []).join(' ')}`;
    const tokens = text.match(re) || [];
    for (const t of tokens) {
      if (KB_GENE_FALSE_POSITIVES.has(t)) continue;
      out.add(t);
    }
  }
  cachedKbGeneSet = out;
  return out;
}

function distinctiveTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length >= 4 && !DISEASE_NAME_STOPWORDS_FINALIZER.has(t));
}

function geneSymbolsIn(text: string, kbGenes: Set<string>): Set<string> {
  const re = /\b[A-Z][A-Z0-9]{2,7}\b/g;
  const tokens = text.match(re) || [];
  const out = new Set<string>();
  for (const t of tokens) {
    if (KB_GENE_FALSE_POSITIVES.has(t)) continue;
    if (kbGenes.has(t)) out.add(t);
  }
  return out;
}

function extractPatientCaseText(pc: PatientCase): string {
  const parts: string[] = [];
  if (pc.chiefComplaint?.description) parts.push(pc.chiefComplaint.description);
  for (const s of pc.symptoms || []) {
    parts.push(s.originalPhrase || '');
    parts.push(s.medicalTerm || '');
  }
  for (const f of pc.medicalHistory?.familyHistory || []) parts.push(f);
  for (const h of pc.medicalHistory?.pastMedicalHistory || []) parts.push(h);
  for (const t of pc.medicalHistory?.testingHistory || []) parts.push(t);
  for (const t of pc.medicalHistory?.recentTests || []) parts.push(t);
  if (pc.patientHypothesis) parts.push(pc.patientHypothesis);
  return parts.join(' ');
}

interface GeneRewriteEvent {
  fromName: string;
  toName: string;
  gene: string;
  candidatesConsidered: number;
}

function applyGeneEvidenceRewrite(
  finalRanking: DiagnosisHypothesis[],
  patientCase: PatientCase,
  hypothesisPool: DiagnosisHypothesis[],
): GeneRewriteEvent | null {
  if (finalRanking.length === 0) return null;

  const kbGenes = getKbGeneSet();
  const patientText = extractPatientCaseText(patientCase);
  const patientGenes = geneSymbolsIn(patientText, kbGenes);
  if (patientGenes.size === 0) return null;

  const top1 = finalRanking[0];
  // Skip if top-1 name already encodes a patient gene — already specific
  const top1Genes = (top1.diagnosis.match(/\b[A-Z][A-Z0-9]{2,7}\b/g) || []).filter(
    (t) => !KB_GENE_FALSE_POSITIVES.has(t),
  );
  for (const g of top1Genes) if (patientGenes.has(g)) return null;

  const top1Tokens = distinctiveTokens(top1.diagnosis);
  if (top1Tokens.length === 0) return null;

  // Find pool hypotheses that share top-1's distinctive tokens AND contain a
  // patient-mentioned gene in their name.
  const candidates: { hyp: DiagnosisHypothesis; gene: string }[] = [];
  const seenNames = new Set<string>();
  for (const h of hypothesisPool) {
    if (h.diagnosis === top1.diagnosis) continue;
    if (seenNames.has(h.diagnosis)) continue;
    seenNames.add(h.diagnosis);
    const hTokens = distinctiveTokens(h.diagnosis);
    if (!top1Tokens.every((t) => hTokens.includes(t))) continue;
    const hGenes = (h.diagnosis.match(/\b[A-Z][A-Z0-9]{2,7}\b/g) || []).filter(
      (t) => !KB_GENE_FALSE_POSITIVES.has(t),
    );
    for (const g of hGenes) {
      if (patientGenes.has(g)) {
        candidates.push({ hyp: h, gene: g });
        break;
      }
    }
  }

  if (candidates.length !== 1) return null;

  const target = candidates[0];
  finalRanking[0] = {
    ...top1,
    diagnosis: target.hyp.diagnosis,
    icd10Code: target.hyp.icd10Code || top1.icd10Code,
    knowledgeBaseMatch: true,
    clinicalReasoning: `${top1.clinicalReasoning || ''}\n[v24 gene-rewrite] Patient reports ${target.gene} mutation; rewriting top-1 from umbrella "${top1.diagnosis}" to gene-specific KB variant "${target.hyp.diagnosis}".`.trim(),
    sourceAgent: top1.sourceAgent || 'gene-rewrite',
  };

  return {
    fromName: top1.diagnosis,
    toName: target.hyp.diagnosis,
    gene: target.gene,
    candidatesConsidered: candidates.length,
  };
}

export class ClaudeFinalizerAgent {
  public readonly name = 'claude-finalizer';

  async execute(opts: {
    patientCase: PatientCase;
    firstPassRanking: DiagnosisHypothesis[];
    firstPassAssessment?: string;
    critique: CritiqueOutput;
    /** Full deduped + KB-attached pool, so finalizer can swap in alternates if needed. */
    fullHypothesisPool: DiagnosisHypothesis[];
    /** v25: family enrichments computed on the synth ranking before finalize. */
    familyEnrichments?: FamilyEnrichment[];
  }): Promise<ClaudeFinalizerOutput> {
    const userPrompt = buildUserPrompt({
      patientCase: opts.patientCase,
      firstPassRanking: opts.firstPassRanking,
      firstPassAssessment: opts.firstPassAssessment,
      critique: opts.critique,
      familyEnrichments: opts.familyEnrichments,
    });

    try {
      setLogContext({ agentName: this.name, stageName: 'claude-finalize' });
    } catch { /* logger optional */ }

    const start = Date.now();
    const result = await callAnthropic({
      systemPrompt: CLAUDE_FINALIZER_SYSTEM_PROMPT,
      userPrompt,
      // Bumped from 12000: finalizer now ingests Claude's FULL ranking (was
      // top-10) plus the critique. Output stays at 10, but the input grows.
      maxTokens: 16000,
      model: CLAUDE_FINALIZER_MODEL,
    });

    try {
      setLogContext({ agentName: undefined, stageName: undefined });
    } catch { /* logger optional */ }

    const parsed = typeof result.content === 'object' && result.content !== null
      ? (result.content as {
          rankedDiagnoses?: Array<{ diagnosis: string; probabilityScore?: number; rationale?: string; changeReason?: string }>;
          overallAssessment?: string;
          criticSuggestionsAccepted?: number;
          criticSuggestionsRejected?: number;
          finalizerNotes?: string;
        })
      : null;

    if (!parsed || !Array.isArray(parsed.rankedDiagnoses)) {
      throw new Error(`Claude finalizer returned non-conforming output (got ${typeof result.content})`);
    }

    // Map finalizer output back to the full hypothesis pool to preserve all
    // upstream fields (criteria fulfillment, evidence, KB profile, etc).
    const pool = opts.fullHypothesisPool;
    const findByName = (name: string): DiagnosisHypothesis | null => {
      const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const found = pool.find((h) => h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
      if (found) return found;
      // Substring fallback (matches v15 ClaudeSynthAgent behavior).
      return pool.find((h) => {
        const hn = h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
        return hn.length >= 12 && (hn.includes(norm) || norm.includes(hn));
      }) || null;
    };

    // Build first-pass rank lookup for changesFromFirstPass annotation.
    // v17+ widened funnel: track the FULL first-pass ranking (not just top-10)
    // so an entry promoted from rank 14 → 7 is annotated with rankBefore=14.
    const firstPassRankByDiag = new Map<string, number>();
    opts.firstPassRanking.forEach((h, i) => {
      const norm = h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      firstPassRankByDiag.set(norm, i + 1);
    });

    type ChangeReason = NonNullable<DiagnosisHypothesis['changesFromFirstPass']>['changeReason'];
    const validChangeReasons: ReadonlyArray<ChangeReason> = ['critique-promoted', 'critique-demoted', 'critique-reordered', 'critique-added', 'no-change', 'finalizer-override'];

    // Index critic 'add' suggestions by normalized name so we can match them
    // to finalizer entries the pool doesn't contain (the case where the
    // finalizer accepted a critic add and emitted a brand-new diagnosis name).
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const addByName = new Map<string, typeof opts.critique.suggestions[number]>();
    for (const s of opts.critique.suggestions) {
      if (s.action === 'add') addByName.set(norm(s.targetDiagnosis), s);
    }

    const finalRanking: DiagnosisHypothesis[] = [];
    for (let i = 0; i < parsed.rankedDiagnoses.length && finalRanking.length < 10; i++) {
      const r = parsed.rankedDiagnoses[i];
      const match = findByName(r.diagnosis);
      // Pool miss: check whether this is an accepted critic 'add'. If yes,
      // build a stub hypothesis so the new diagnosis survives into the report.
      let entry: DiagnosisHypothesis | null = match;
      let isCritiqueAdd = false;
      if (!entry) {
        const addSugg = addByName.get(norm(r.diagnosis));
        if (addSugg) {
          isCritiqueAdd = true;
          entry = {
            diagnosis: r.diagnosis,
            confidenceScore: typeof r.probabilityScore === 'number' ? r.probabilityScore : 50,
            evidenceScore: typeof r.probabilityScore === 'number' ? r.probabilityScore : 50,
            rareDisease: false,
            supportingEvidence: (addSugg.evidence || []).map((e) => ({
              finding: e,
              patientSymptom: '',
              strength: 'moderate',
              type: 'supporting',
              attributedTo: 'o3-critic',
            })),
            contradictoryEvidence: [],
            clinicalReasoning: `[o3-critic add]: ${addSugg.reasoning}`,
            typicalPresentation: '',
            specialistRequired: '',
            diagnosticCriteria: { criteriaName: '', totalCriteria: 0, metCriteria: 0, criteriaDetails: [], fulfillmentPercentage: 0 },
            sourceAgent: 'o3-critic-add',
            sourceAgents: ['o3-critic'],
            evaluationType: 'reasoning-evaluated',
            knowledgeBaseMatch: false,
          } as DiagnosisHypothesis;
        }
      }
      if (!entry) continue;
      if (finalRanking.some((x) => x.diagnosis === entry!.diagnosis)) continue;
      const rankBeforeNorm = norm(entry.diagnosis);
      const rankBefore = isCritiqueAdd ? null : (firstPassRankByDiag.get(rankBeforeNorm) ?? null);
      const rankAfter = i + 1;
      const rawReason = r.changeReason
        || (isCritiqueAdd ? 'critique-added' : (rankBefore === rankAfter ? 'no-change' : 'critique-reordered'));
      const changeReason: ChangeReason = (validChangeReasons as ReadonlyArray<string>).includes(rawReason)
        ? (rawReason as ChangeReason)
        : 'finalizer-override';
      const copy: DiagnosisHypothesis = { ...entry };
      if (typeof r.probabilityScore === 'number') {
        copy.confidenceScore = r.probabilityScore;
        copy.evidenceScore = r.probabilityScore;
      }
      if (typeof r.rationale === 'string' && r.rationale.length > 0) {
        copy.clinicalReasoning = `${copy.clinicalReasoning || ''}\n[finalizer]: ${r.rationale}`.trim();
      }
      copy.changesFromFirstPass = { rankBefore, rankAfter, changeReason };
      finalRanking.push(copy);
    }

    // Add any first-pass top-10 entries the finalizer didn't include — they're
    // demoted but not dropped (matches v15 ClaudeSynth behavior of falling
    // through unranked but evaluated hypotheses).
    for (const h of opts.firstPassRanking) {
      if (finalRanking.length >= 10) break;
      if (finalRanking.some((x) => x.diagnosis === h.diagnosis)) continue;
      const copy: DiagnosisHypothesis = {
        ...h,
        changesFromFirstPass: {
          rankBefore: firstPassRankByDiag.get(h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '')) ?? null,
          rankAfter: finalRanking.length + 1,
          changeReason: 'critique-demoted',
        },
      };
      finalRanking.push(copy);
    }

    // Compute deltas vs first-pass top-10 for telemetry.
    const firstPassNames = new Set(
      opts.firstPassRanking.slice(0, 10).map((h) => h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '')),
    );
    const finalNames = new Set(
      finalRanking.slice(0, 10).map((h) => h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '')),
    );
    const removedFromTop10: string[] = [];
    const addedToTop10: string[] = [];
    for (const h of opts.firstPassRanking.slice(0, 10)) {
      const n = h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!finalNames.has(n)) removedFromTop10.push(h.diagnosis);
    }
    for (const h of finalRanking.slice(0, 10)) {
      const n = h.diagnosis.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!firstPassNames.has(n)) addedToTop10.push(h.diagnosis);
    }
    const rankChangesFromFirstPass = finalRanking
      .slice(0, 10)
      .filter((h) => h.changesFromFirstPass && h.changesFromFirstPass.rankBefore !== h.changesFromFirstPass.rankAfter)
      .length;

    // v24: gene-evidence-driven top-1 rewrite (post-finalizer, deterministic).
    const geneRewrite = applyGeneEvidenceRewrite(finalRanking, opts.patientCase, pool);
    if (geneRewrite) {
      console.log(
        `[ClaudeFinalizer] v24 gene-rewrite: top-1 "${geneRewrite.fromName}" → "${geneRewrite.toName}" (gene: ${geneRewrite.gene})`,
      );
    }

    return {
      agentName: this.name,
      hypotheses: finalRanking,
      reasoning: parsed.overallAssessment || '',
      confidence: finalRanking[0]?.confidenceScore || 0,
      tokensUsed: result.tokensUsed,
      durationMs: Date.now() - start,
      model: result.model || CLAUDE_FINALIZER_MODEL,
      finalizerStats: {
        criticSuggestionsAccepted: parsed.criticSuggestionsAccepted ?? 0,
        criticSuggestionsRejected: parsed.criticSuggestionsRejected ?? 0,
        rankChangesFromFirstPass,
        removedFromTop10,
        addedToTop10,
        geneRewrite: geneRewrite ?? undefined,
      },
    } as ClaudeFinalizerOutput;
  }
}
