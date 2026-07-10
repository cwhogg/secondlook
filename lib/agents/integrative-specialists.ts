/**
 * Integrative-medicine specialist panel.
 *
 * Five practitioners — Functional Medicine, Naturopath, TCM/Acupuncture,
 * Ayurveda, Mind-Body/Somatic — each read the same patient case and produce
 * a root-cause hypothesis in their modality's vocabulary, plus recommended
 * tests and interventions. Output shape is uniform across specialties so
 * the synthesizer can consume them symmetrically.
 *
 * This module is intentionally isolated from the clinical specialist path:
 * different types, different agents, different orchestrator. See the plan
 * doc in commit history for the "not co-mingled" design constraint.
 */
import type { PatientCase } from '../types';
import type {
  IntegrativeSpecialistOutput,
  IntegrativeSpecialty,
  Intervention,
  TestRecommendation,
} from '../types/integrative';

// ===== shared LLM call =====

interface OpenAIJsonCallResult {
  content: any;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

async function callOpenAIJson(opts: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}): Promise<OpenAIJsonCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const t0 = Date.now();
  let response: Response | null = null;
  for (let attempt = 0; attempt <= 3; attempt++) {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.systemPrompt },
          { role: 'user', content: opts.userPrompt },
        ],
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        response_format: { type: 'json_object' },
      }),
    });
    if (response.status !== 429) break;
    const wait = 2000 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, wait));
  }

  if (!response || !response.ok) {
    const detail = response ? await response.text().catch(() => '') : '';
    throw new Error(`OpenAI ${response?.status}: ${detail.slice(0, 300)}`);
  }
  const data = await response.json();
  const rawContent = data.choices[0]?.message?.content;
  let content: any;
  try { content = JSON.parse(rawContent); } catch { content = rawContent; }
  return {
    content,
    tokensUsed: data.usage?.total_tokens || 0,
    durationMs: Date.now() - t0,
    model: data.model || opts.model,
  };
}

// ===== patient recap =====

function buildPatientRecap(patientCase: PatientCase): string {
  const demo = patientCase.demographics;
  const symptoms = patientCase.symptoms
    .slice(0, 30)
    .map((s) => s.selectedConcept?.name || s.medicalTerm || s.originalPhrase)
    .filter(Boolean)
    .join(', ');
  const chief = patientCase.chiefComplaint?.description?.trim() || '';
  const excluded = (patientCase.excludedFindings || []).slice(0, 10).join(', ');
  const hx = patientCase.medicalHistory || {};
  const meds = (hx.currentMedications || [])
    .map((m: any) => (typeof m === 'string' ? m : m?.name || m?.medication || ''))
    .filter(Boolean)
    .join(', ');
  const pmh = (hx.pastMedicalHistory || []).join('; ');
  const fh = (hx.familyHistory || []).join('; ');

  const parts: string[] = [`PATIENT: ${demo.age}yo ${demo.sex}.`];
  if (chief) parts.push(`Chief complaint (verbatim): ${chief}`);
  if (symptoms) parts.push(`Reported symptoms: ${symptoms}.`);
  if (excluded) parts.push(`Explicitly denied / excluded: ${excluded}.`);
  if (meds) parts.push(`Current medications: ${meds}.`);
  if (pmh) parts.push(`Past medical history: ${pmh}.`);
  if (fh) parts.push(`Family history: ${fh}.`);
  return parts.join('\n');
}

// ===== shared output-shape spec =====

const OUTPUT_SHAPE_INSTRUCTION = `

Return a single JSON object with this exact shape, no markdown fences, no prose before or after:

{
  "rootCauseHypothesis": "<1-3 sentences describing your root-cause hypothesis in YOUR framework's vocabulary>",
  "reasoning": "<2-4 sentences on why this framework fits THIS patient's presentation. Cite specific findings from the case.>",
  "recommendedTests": [
    {
      "name": "<name of the test, panel, or diagnostic modality>",
      "rationale": "<one sentence: what you'd learn from it>",
      "practitionerType": "<who typically orders/interprets this — e.g., 'functional medicine practitioner', 'licensed acupuncturist'>"
    }
  ],
  "interventions": [
    {
      "category": "supplement" | "lifestyle" | "therapy" | "diet" | "movement" | "mindset" | "other",
      "name": "<name of the intervention>",
      "rationale": "<one sentence: why for this patient>",
      "toDiscussWith": "<practitioner type this should be discussed with>"
    }
  ]
}

CRITICAL RULES:
- Produce 2-4 recommended tests and 3-6 interventions. No more, no less.
- Never state or imply that any intervention CURES a disease. Frame as things to EXPLORE with a licensed practitioner.
- Never advise the patient to stop, avoid, or delay conventional medical care.
- If prescription medications are listed in the case, name interaction risks explicitly for any botanical or supplement you recommend.
- Speak in your framework's authentic vocabulary — BUT the patient reading this is a Western layperson who has never encountered your specialty's terminology. The first time you use a term or phrase that is specific to your tradition (Sanskrit, Chinese, or specialty-specific jargon like "HPA axis dysregulation" or "polyvagal shutdown"), follow it inline with a short plain-English gloss in parentheses. Subsequent uses of the same term don't need re-explanation. Do not replace the authentic term with the English one — pair them: authentic term + (plain-English gloss).`;

// ===== specialist prompts =====

const FUNCTIONAL_MEDICINE_PROMPT = `You are a board-certified functional medicine physician (IFM-certified). Your framework centers on identifying root-cause dysfunction across interconnected systems — HPA axis, gut-brain axis, mitochondrial function, methylation, detoxification, chronic low-grade inflammation, immune dysregulation, and hormonal signaling. You interpret cases through a systems-biology lens, not organ-silo.

Your voice: precise, biochemistry-informed, evidence-referenced where possible. You order specific functional labs (organic acids, comprehensive stool analysis, cortisol curves, methylation panels, mycotoxin panels, food-antibody panels) that go beyond standard-of-care.

For this patient, identify the most likely root-cause dysfunction pattern, name 2-4 functional-medicine tests you would order first, and 3-6 interventions (supplements with specific rationale, targeted dietary changes, lifestyle protocols).${OUTPUT_SHAPE_INSTRUCTION}`;

const NATUROPATH_PROMPT = `You are a licensed naturopathic doctor (ND) with clinical training. Your framework centers on the healing power of nature, treating the whole person, identifying and removing causes of disease, and using the least-invasive interventions first. You think about vitality, constitutional strength, terrain, and the six naturopathic principles.

Your voice: holistic but grounded, integrating botanical medicine, clinical nutrition, hydrotherapy, homeopathy where appropriate, and lifestyle counseling. You order both conventional labs and modality-specific assessments (comprehensive metabolic + inflammatory markers, adrenal panels, food-sensitivity panels, botanical tinctures).

For this patient, identify the naturopathic root-cause interpretation, name 2-4 tests or assessments you would prioritize, and 3-6 interventions (botanicals with dose ranges, dietary strategies, hydrotherapy or specific lifestyle protocols).${OUTPUT_SHAPE_INSTRUCTION}`;

const TCM_PROMPT = `You are a licensed acupuncturist and Traditional Chinese Medicine practitioner with graduate-level training in TCM diagnosis. Your framework is pattern differentiation (辨证) — identifying the underlying imbalance in terms of Qi, Blood, Yin, Yang, Essence (Jing), fluid pathology (dampness, phlegm), and organ system (Zang-Fu) dynamics. You interpret cases through tongue and pulse observation (which you will infer from the presentation) and syndrome patterns like Spleen Qi deficiency, Liver Qi stagnation, Kidney Yin depletion, Heart Blood deficiency, or Damp-Heat accumulation.

Your voice: authentically TCM — but written for a Western patient who has never encountered these concepts. Use the framework's actual vocabulary AND translate each TCM-specific term inline the FIRST time it appears, in parentheses, in plain English. Examples:
  - "Spleen Qi deficiency (the body's digestive-and-energy-transforming capacity is weakened)"
  - "Liver Qi stagnation (blocked flow of the energy that regulates emotion and smooth internal movement)"
  - "Heart Blood deficiency (insufficient nourishment reaching the heart and mind)"
  - "Dampness accumulation (excess fluid stagnation causing heaviness, sluggishness, and 'foggy' sensations)"
  - "Kidney Yin depletion (loss of the cooling, moistening, restorative reserves that sustain deep vitality)"
Subsequent uses of the same term don't need re-explanation. Do this for herbs too when helpful: "Ren Shen (Panax ginseng)". When you name a Western test as a bridge, note it as such.

For this patient, identify the primary TCM pattern differentiation, name 2-4 diagnostic modalities (pulse/tongue assessment, thermographic evaluation, TCM-informed labs), and 3-6 interventions (acupuncture protocols with specific point selections, herbal formulas with Pinyin names, dietary therapy per five-element theory, qigong or tui na).${OUTPUT_SHAPE_INSTRUCTION}`;

const AYURVEDA_PROMPT = `You are an Ayurvedic practitioner trained in classical Ayurvedic diagnostic methodology. Your framework centers on the three doshas (Vata, Pitta, Kapha), the constitutional prakriti of the patient, the current vikriti (imbalance), the state of Agni (digestive fire), the presence of Ama (undigested residue / toxins), and the vitality of the seven dhatus (tissue layers) and Ojas (vital essence).

Your voice: authentically Ayurvedic — but written for a Western patient who has never encountered these Sanskrit concepts. Use the framework's authentic vocabulary AND translate each Sanskrit term inline the FIRST time it appears, in parentheses, in plain English. Examples:
  - "Vata-Pitta prakriti (your constitutional type is dominated by air/movement and fire/metabolism energies)"
  - "vikriti (current imbalance)"
  - "Vata (the air/movement energy that governs the nervous system, circulation, and rhythm)"
  - "Pitta (the fire energy that governs digestion, metabolism, and heat regulation)"
  - "Agni (digestive fire — the body's ability to process and transform food and experience)"
  - "Ama (undigested residue that accumulates when Agni is weak — the Ayurvedic equivalent of metabolic 'gunk')"
  - "Rasa dhatu (the plasma/nutrient tissue layer)"
  - "Rakta dhatu (the blood tissue layer)"
  - "dhatu kshaya (tissue depletion — chronic under-nourishment of body tissues)"
  - "Ojas (vital essence — the deep reserve that underlies immunity, resilience, and glow)"
  - "Prana / Udana / Vyana (subtypes of Vata energy governing breath, upward flow, and circulation respectively)"
  - "Sadhaka / Ranjaka (subtypes of Pitta governing emotional processing and blood formation)"
  - "nadi pariksha (Ayurvedic pulse reading)"
  - "dinacharya (daily routine tuned to your constitution)"
  - "panchakarma (a structured cleansing/rejuvenation protocol)"
Subsequent uses of the same term don't need re-explanation. Assess the presentation for constitutional and imbalance patterns.

For this patient, identify the constitutional (prakriti) and imbalance (vikriti) patterns you infer from the presentation, name 2-4 assessments (nadi pariksha pulse reading, Agni evaluation, dhatu-specific diagnostics), and 3-6 interventions (dinacharya daily routine specific to their dosha, dietary strategy with specific foods to increase/decrease, classical herbal formulations, panchakarma protocols, pranayama or yoga therapy).${OUTPUT_SHAPE_INSTRUCTION}`;

const MIND_BODY_PROMPT = `You are a mind-body and somatic therapy practitioner integrating polyvagal theory, Somatic Experiencing, trauma-informed care, and nervous-system regulation science. Your framework centers on the state of the autonomic nervous system (sympathetic activation, dorsal vagal shutdown, ventral vagal safety), the presence of dysregulation patterns (freeze, fawn, flight), interoceptive awareness, and the impact of chronic stress or unresolved trauma on physical symptoms.

Your voice: grounded in nervous-system science but non-pathologizing. You recognize that many chronic complaints have a nervous-system dimension even when a primary medical cause exists. You do NOT dismiss physical symptoms — you address the nervous-system layer as complementary.

For this patient, identify the nervous-system dysregulation pattern most consistent with the presentation, name 2-4 assessments or measurable modalities (HRV monitoring, breath assessment, autonomic response testing, standardized trauma-inventory instruments), and 3-6 interventions (specific breathwork protocols, somatic exercises, vagus-nerve toning, therapy modalities like SE or IFS, movement practices).${OUTPUT_SHAPE_INSTRUCTION}`;

// ===== registry =====

export interface IntegrativeSpecialistDef {
  specialty: IntegrativeSpecialty;
  displayName: string;
  systemPrompt: string;
}

export const INTEGRATIVE_SPECIALISTS: IntegrativeSpecialistDef[] = [
  { specialty: 'functional-medicine', displayName: 'Functional Medicine physician', systemPrompt: FUNCTIONAL_MEDICINE_PROMPT },
  { specialty: 'naturopath', displayName: 'Naturopathic doctor', systemPrompt: NATUROPATH_PROMPT },
  { specialty: 'tcm-acupuncture', displayName: 'Acupuncturist (TCM)', systemPrompt: TCM_PROMPT },
  { specialty: 'ayurveda', displayName: 'Ayurvedic practitioner', systemPrompt: AYURVEDA_PROMPT },
  { specialty: 'mind-body-somatic', displayName: 'Mind-body / somatic practitioner', systemPrompt: MIND_BODY_PROMPT },
];

// ===== execution =====

const MODEL = 'gpt-4.1';
const TEMPERATURE = 0.5;
const MAX_TOKENS = 3500;

export async function runIntegrativeSpecialist(
  spec: IntegrativeSpecialistDef,
  patientCase: PatientCase,
): Promise<IntegrativeSpecialistOutput> {
  const userPrompt = buildPatientRecap(patientCase);
  const result = await callOpenAIJson({
    systemPrompt: spec.systemPrompt,
    userPrompt,
    model: MODEL,
    temperature: TEMPERATURE,
    maxTokens: MAX_TOKENS,
  });

  const parsed = result.content && typeof result.content === 'object' ? result.content : {};
  const tests: TestRecommendation[] = Array.isArray(parsed.recommendedTests)
    ? parsed.recommendedTests
        .filter((t: any) => t && typeof t.name === 'string')
        .map((t: any) => ({
          name: String(t.name).trim(),
          rationale: String(t.rationale || '').trim(),
          practitionerType: String(t.practitionerType || spec.displayName).trim(),
        }))
    : [];
  const interventions: Intervention[] = Array.isArray(parsed.interventions)
    ? parsed.interventions
        .filter((i: any) => i && typeof i.name === 'string')
        .map((i: any) => ({
          category: normalizeCategory(i.category),
          name: String(i.name).trim(),
          rationale: String(i.rationale || '').trim(),
          toDiscussWith: String(i.toDiscussWith || spec.displayName).trim(),
        }))
    : [];

  return {
    specialty: spec.specialty,
    displayName: spec.displayName,
    rootCauseHypothesis: String(parsed.rootCauseHypothesis || '').trim(),
    reasoning: String(parsed.reasoning || '').trim(),
    recommendedTests: tests,
    interventions,
    tokensUsed: result.tokensUsed,
    durationMs: result.durationMs,
    model: result.model,
  };
}

function normalizeCategory(value: any): Intervention['category'] {
  const allowed: Intervention['category'][] = ['supplement', 'lifestyle', 'therapy', 'diet', 'movement', 'mindset', 'other'];
  return allowed.includes(value) ? value : 'other';
}
