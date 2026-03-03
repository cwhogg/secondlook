import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callAnthropic } from '@/lib/anthropic';
import { loadDiseaseDatabase } from '@/lib/knowledge/index';
import type { PatientArchetype } from '@/lib/types/admin';
import type { DiseaseProfile, BodySystem } from '@/lib/types/knowledge-base';
import nonKbDiseases from '@/lib/knowledge/non-kb-diseases.json';

const inputSchema = z.object({
  difficulty: z.number().min(1).max(5),
  categoryHint: z.string().optional(),
  excludeDiseases: z.array(z.string()).optional(),
});

// ===== ARCHETYPE SYSTEM =====

interface ArchetypeConfig {
  name: PatientArchetype;
  label: string;
  minDifficulty: number;
  narrativeRules: string;
}

const ARCHETYPES: ArchetypeConfig[] = [
  {
    name: 'researcher',
    label: 'The Researcher',
    minDifficulty: 1,
    narrativeRules: `ARCHETYPE: The Researcher — patient has Googled extensively before this visit.
- Use medical terminology, but get some of it slightly wrong or use it imprecisely ("I think I might have a connective tissue disorder — my sed rate was elevated")
- Reference specific conditions they've read about, including at least one wrong self-diagnosis
- Cite things they found online: "I read that this could be [wrong condition]"
- Mix accurate observations with misinterpreted test results or symptoms
- Show anxiety about specific diagnoses they've fixated on
- May downplay symptoms that don't fit their self-diagnosis theory
- Narrative length: 900-1300 characters`,
  },
  {
    name: 'minimizer',
    label: 'The Minimizer',
    minDifficulty: 2,
    narrativeRules: `ARCHETYPE: The Minimizer — patient downplays everything and thinks they're wasting the doctor's time.
- Open with a dismissive framing: "This is probably nothing, but..." or "My wife made me come in"
- Actively minimize severity: "a little" discomfort, "not that bad," "I can live with it"
- OMIT 2-3 diagnostically important symptoms entirely — the patient doesn't think they're related or worth mentioning
- Use vague language for remaining symptoms: "sometimes my hands feel funny" instead of describing paresthesia
- Keep the narrative SHORT (600-900 characters) — this patient doesn't elaborate
- End with something dismissive: "I'm sure it's just stress" or "I probably just need to sleep more"
- Set mentionedInNarrative: false for the omitted symptoms in the JSON`,
  },
  {
    name: 'storyteller',
    label: 'The Storyteller',
    minDifficulty: 1,
    narrativeRules: `ARCHETYPE: The Storyteller — patient gives an exhaustive chronological narrative with life context woven in.
- Start with a specific triggering event or life change: "It all started when I moved to Arizona for my daughter's wedding..."
- Embed symptoms within life stories — a key symptom should be BURIED in an anecdote about something else
- Include tangential details: work stress, family situations, what a friend/coworker said about their symptoms
- Use imprecise temporal markers: "around Thanksgiving," "after my son's graduation," "I think it was last summer"
- Return to earlier symptoms later: "Oh, I forgot to mention — that rash I told you about? It actually started before the joint thing"
- Include at least one false start or correction: "Well, actually, now that I think about it..."
- Narrative length: 1200-1800 characters (this patient TALKS)`,
  },
  {
    name: 'frustrated-chronic',
    label: 'The Frustrated Chronic',
    minDifficulty: 2,
    narrativeRules: `ARCHETYPE: The Frustrated Chronic Patient — has seen many doctors, tired and skeptical.
- Reference previous doctors and failed diagnoses: "My last doctor said it was fibromyalgia but the treatment didn't help"
- Express frustration or resignation: "I've been dealing with this for years," "Nobody can figure out what's wrong"
- Mention treatments that failed or tests that were inconclusive
- May present symptoms in order of what previous doctors focused on, NOT in order of clinical importance
- Some symptoms described through the lens of what was ruled out: "They tested me for lupus — that was negative"
- Include one detail that hints at a dismissed symptom: "One doctor mentioned my [finding] but said it wasn't important"
- Show fatigue with the medical process itself
- Narrative length: 900-1400 characters`,
  },
  {
    name: 'anxious',
    label: 'The Anxious Patient',
    minDifficulty: 2,
    narrativeRules: `ARCHETYPE: The Anxious Patient — catastrophizes and mixes real symptoms with anxiety-driven concerns.
- Mix genuine disease symptoms with anxiety manifestations (racing heart, trouble sleeping, "I just know something is really wrong")
- Catastrophize: escalate mild findings into feared diagnoses
- Mention physical symptoms of anxiety alongside disease symptoms without distinguishing them
- Ask worried questions within the narrative: "Could this be cancer?" "Is this going to get worse?"
- Over-report symptom severity for some symptoms while accurately reporting others
- Include 1-2 symptoms that are purely anxiety-driven (not part of the disease) as noise
- Show hyperawareness of body sensations: "I've been checking my [body part] every day and I swear it's getting worse"
- Narrative length: 1000-1400 characters`,
  },
  {
    name: 'stoic',
    label: 'The Stoic',
    minDifficulty: 3,
    narrativeRules: `ARCHETYPE: The Stoic — brief, matter-of-fact, minimal elaboration.
- State symptoms flatly with minimal emotional content: "I have pain in my joints. Started about a year ago."
- VERY concise — patient answers questions but doesn't volunteer extra information
- OMIT 1-2 symptoms they consider "normal for my age" or "not worth mentioning"
- No adjectives or emotional language — just facts
- When pressed for details, give minimal responses: "Yes, it's worse in the morning. Maybe an hour."
- Don't describe impact on daily life unless directly relevant
- Set mentionedInNarrative: false for omitted symptoms
- Narrative length: 400-700 characters (this patient is BRIEF)`,
  },
  {
    name: 'caregiver-proxy',
    label: 'The Caregiver Proxy',
    minDifficulty: 2,
    narrativeRules: `ARCHETYPE: Caregiver Proxy — a family member describing the patient's symptoms secondhand.
- Write in third person: "My mother has been..." or "My husband started..."
- Include observations the patient might not notice themselves: "She doesn't seem to realize she's walking differently"
- Miss internal symptoms (pain levels, sensations) that only the patient would know — describe only what's observable
- Include the caregiver's own interpretation: "I think it's getting worse" or "She says it doesn't hurt but I can tell it does"
- Add context about how symptoms affect the family: "We had to cancel our vacation because..."
- May have timeline gaps: "I'm not sure exactly when it started — she didn't tell me right away"
- Show concern mixed with practical details
- Narrative length: 900-1300 characters`,
  },
  {
    name: 'elderly-vague',
    label: 'The Elderly Vague',
    minDifficulty: 3,
    narrativeRules: `ARCHETYPE: Elderly Vague — temporal imprecision, attributes symptoms to aging.
- Set demographics to age 65+
- Attribute genuine disease symptoms to normal aging: "Well, at my age, you expect some aches and pains"
- Temporal imprecision throughout: "a while back," "I don't remember exactly," "it's been going on for some time"
- Conflate multiple symptoms: "I just don't feel right" covering several distinct issues
- OMIT 1-2 symptoms dismissed as "just getting old"
- Mention unrelated age-appropriate concerns (blood pressure meds, knee replacement, etc.) that add noise
- Focus on the most bothersome symptom while barely mentioning others that may be more diagnostically important
- Use colloquial terms: "my sugar," "water pills," "that nerve test"
- Set mentionedInNarrative: false for omitted symptoms
- Narrative length: 700-1000 characters`,
  },
];

function selectArchetype(difficulty: number): ArchetypeConfig {
  const eligible = ARCHETYPES.filter(a => a.minDifficulty <= difficulty);
  return eligible[Math.floor(Math.random() * eligible.length)];
}

// ===== ANTI-PATTERN RULES =====

const ANTI_PATTERN_RULES = `
=== ANTI-PATTERNS — DO NOT DO THESE ===
1. DO NOT list symptoms in body-system order. Real patients describe what bothers them most, or what happened first, or what scared them.
2. DO NOT give every symptom equal weight. Real patients fixate on 1-2 concerns and barely mention others.
3. DO NOT use perfect medical lay terminology. "The tips of my fingers get this weird pins-and-needles thing, mostly when it's cold" is more real than "I have tingling in my fingertips."
4. DO NOT make the narrative a complete symptom inventory. Include ~60-80% of symptoms. The rest the patient would only mention if asked directly.
5. DO NOT write a single coherent paragraph with perfect flow. Real speech has false starts, topic jumps, returns to earlier points.
6. DO NOT remove all irrelevant information. Include tangential details (work, stress, other doctors, diet, something a friend said).
7. DO NOT make all symptoms clearly distinguishable. Real patients conflate symptoms, describe two things as one, or split one symptom into multiple complaints.
`;

// ===== CATEGORY → BODY SYSTEM MAPPING =====

const CATEGORY_TO_BODY_SYSTEMS: Record<string, BodySystem[]> = {
  neurological: ['neurological'],
  rheumatological: ['musculoskeletal', 'immunological'],
  cardiovascular: ['cardiovascular'],
  hematological: ['hematological'],
  endocrine: ['endocrine'],
  gastrointestinal: ['gastrointestinal'],
  pulmonary: ['respiratory'],
  dermatological: ['dermatological'],
  immunological: ['immunological'],
  musculoskeletal: ['musculoskeletal'],
  renal: ['renal'],
  psychiatric: ['psychiatric'],
  oncological: ['hematological'],
};

// ===== DISEASE PRE-SELECTION =====

/** Fisher-Yates shuffle (in-place, returns same array) */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Probability that Claude picks freely (non-KB) at each difficulty */
const FREE_CHOICE_PROBABILITY: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0.2,
  4: 0.35,
  5: 0.5,
};

function formatSymptomList(symptoms: DiseaseProfile['symptoms']['pathognomonic']): string {
  if (symptoms.length === 0) return 'none';
  return symptoms
    .map(s => `${s.symptomName} (${Math.round(s.frequency * 100)}%, ${s.bodySystem})`)
    .join('; ');
}

function formatDiseaseProfile(disease: DiseaseProfile): string {
  const lines = [
    `Disease: ${disease.name}`,
    `Aliases: ${disease.aliases.length > 0 ? disease.aliases.join(', ') : 'none'}`,
    `ICD-10: ${disease.icd10Codes.join(', ') || 'unknown'}`,
    `Prevalence: ${disease.prevalence.estimate}${disease.prevalence.range ? ` (range: ${disease.prevalence.range})` : ''}`,
    `Typical onset: age ${disease.demographics.typicalOnsetAge.min}-${disease.demographics.typicalOnsetAge.max}${disease.demographics.typicalOnsetAge.peak ? `, peak ~${disease.demographics.typicalOnsetAge.peak}` : ''}, sex predilection: ${disease.demographics.sexPredilection}`,
    `Body systems: ${disease.systemsAffected.join(', ')}`,
    `Pathognomonic symptoms (>90%): ${formatSymptomList(disease.symptoms.pathognomonic)}`,
    `Common symptoms (>50%): ${formatSymptomList(disease.symptoms.common)}`,
    `Occasional symptoms (10-50%): ${formatSymptomList(disease.symptoms.occasional)}`,
    `Rare symptoms (<10%): ${formatSymptomList(disease.symptoms.rare)}`,
  ];

  if (disease.diagnosticCriteria.formalCriteriaName) {
    lines.push(`Diagnostic criteria: ${disease.diagnosticCriteria.formalCriteriaName}`);
    if (disease.diagnosticCriteria.minimumForDiagnosis) {
      lines.push(`  Minimum for diagnosis: ${disease.diagnosticCriteria.minimumForDiagnosis}`);
    }
    const majors = disease.diagnosticCriteria.criteria.filter(c => c.category === 'major');
    const minors = disease.diagnosticCriteria.criteria.filter(c => c.category === 'minor');
    if (majors.length > 0) {
      lines.push(`  Major criteria: ${majors.map(c => c.description).join('; ')}`);
    }
    if (minors.length > 0) {
      lines.push(`  Minor criteria: ${minors.map(c => c.description).join('; ')}`);
    }
  }

  const findings = [];
  if (disease.keyFindings.laboratory.length > 0) findings.push(`Lab: ${disease.keyFindings.laboratory.join(', ')}`);
  if (disease.keyFindings.imaging.length > 0) findings.push(`Imaging: ${disease.keyFindings.imaging.join(', ')}`);
  if (disease.keyFindings.genetic.length > 0) findings.push(`Genetic: ${disease.keyFindings.genetic.join(', ')}`);
  if (disease.keyFindings.other.length > 0) findings.push(`Other: ${disease.keyFindings.other.join(', ')}`);
  if (findings.length > 0) {
    lines.push(`Key findings: ${findings.join(' | ')}`);
  }

  if (disease.redFlags.length > 0) {
    lines.push(`Red flags: ${disease.redFlags.join('; ')}`);
  }

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  const requestId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured', requestId },
      { status: 503 }
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

  try {
    // Load KB diseases
    const diseases = loadDiseaseDatabase();
    const excludeSet = new Set(input.excludeDiseases || []);

    // Filter by category hint (map to body systems)
    let candidateDiseases = diseases.filter(d => !excludeSet.has(d.name));
    if (input.categoryHint && CATEGORY_TO_BODY_SYSTEMS[input.categoryHint]) {
      const targetSystems = CATEGORY_TO_BODY_SYSTEMS[input.categoryHint];
      const filtered = candidateDiseases.filter(d =>
        d.systemsAffected.some(s => targetSystems.includes(s))
      );
      // Only apply filter if it leaves us with candidates
      if (filtered.length > 0) {
        candidateDiseases = filtered;
      }
    }

    // Decide: pre-select a KB disease or let Claude pick freely?
    const freeChoiceProbability = FREE_CHOICE_PROBABILITY[input.difficulty] || 0;
    const useFreeChoice = candidateDiseases.length === 0 || Math.random() < freeChoiceProbability;

    let preSelectedDisease: DiseaseProfile | null = null;
    if (!useFreeChoice && candidateDiseases.length > 0) {
      preSelectedDisease = candidateDiseases[Math.floor(Math.random() * candidateDiseases.length)];
    }

    // Select archetype based on difficulty
    const archetype = selectArchetype(input.difficulty);

    const difficultyDescriptions: Record<number, string> = {
      1: `EASY — Textbook presentation. Classic, well-described symptoms with pathognomonic or highly specific features present. Straightforward differential.`,
      2: `MODERATE — Mostly typical presentation with 1-2 less common features. Well-defined diagnostic criteria that the patient mostly meets.`,
      3: `CHALLENGING — Use ONE OR MORE of these difficulty factors (choose what fits the disease naturally):
  • Atypical features or overlapping differential (symptoms shared by multiple conditions)
  • Early/incomplete presentation missing 1-2 key features that would clinch the diagnosis
  • Mild comorbidities that complicate the picture`,
      4: `HARD — Use TWO OR MORE of these difficulty factors (choose what fits the disease naturally):
  • Nonspecific symptom profile — symptoms individually common but the combination is telling
  • High diagnostic overlap — multiple legitimate rare diseases share this presentation
  • Poorly characterized disease with less established or informal diagnostic criteria
  • Evolving/early presentation where classic features haven't fully emerged
  • Contradictory or misleading symptoms (1-2 red herrings pointing to wrong specialty/category)
  Do NOT default to ultra-rare — a moderately rare disease with nonspecific or conflicting symptoms can be harder to diagnose than an ultra-rare disease with pathognomonic features.`,
      5: `EXPERT — Use THREE OR MORE of these difficulty factors (choose what fits the disease naturally):
  • Extremely nonspecific symptoms that individually suggest common conditions
  • Contradictory symptoms pointing different specialists in different directions
  • Disease poorly characterized in literature with no formal diagnostic criteria
  • Symptom pattern that doesn't cleanly fit any known disease category
  • Key distinguishing features require specific testing (genetic, biopsy, advanced imaging) not yet performed
  • Multiple red herrings including real symptoms from comorbidities
  A well-known rare disease with a terrible symptom profile is a valid expert case — do NOT equate "expert" with "ultra-rare."`,
    };

    const categoryInstruction = input.categoryHint
      ? `\nFocus on diseases in the "${input.categoryHint}" category or body system.`
      : '';

    // Build disease context for the prompt
    let diseaseInstruction: string;
    if (preSelectedDisease) {
      diseaseInstruction = `Generate a patient case for the following disease. Use the profile below to create an accurate presentation.

${formatDiseaseProfile(preSelectedDisease)}`;
    } else {
      // Free choice: pre-select a non-KB disease from the Orphanet-derived list
      // Server picks the disease — never let the LLM choose
      const nonKbCandidate = nonKbDiseases[Math.floor(Math.random() * nonKbDiseases.length)];
      diseaseInstruction = `Generate a patient case for the following disease. This disease is NOT in our knowledge base, so use your medical knowledge to create an accurate presentation.

Disease: ${nonKbCandidate.name}
Orphanet code: ORPHA:${nonKbCandidate.orphaCode}

Use your knowledge of this disease to generate accurate symptoms, demographics, and clinical features. If you are not familiar with this specific disease, research what you do know about the name, associated gene/pathway, or disease family to create a clinically plausible case.`;
    }

    const systemPrompt = `You are a clinical simulation specialist creating synthetic rare disease patient presentations for a diagnostic AI testing framework.

Your task: Generate a realistic first-person patient narrative and structured clinical data for a rare disease case at difficulty level ${input.difficulty}/5.

${difficultyDescriptions[input.difficulty]}

${archetype.narrativeRules}

${ANTI_PATTERN_RULES}

IMPORTANT RULES:
- The narrative MUST follow the archetype rules above. The archetype determines HOW the patient communicates.
- Include realistic demographics (age, sex) that match the epidemiology of the chosen disease
- Generate 5-10 symptoms with proper medical terms AND the lay descriptions the patient would use
- For each symptom, set "mentionedInNarrative" to true if it appears in the narrative, or false if the patient would NOT mention it unprompted (omitted symptoms). At least 60% should be true.
- Include relevant medical history, family history, and medications where appropriate
- The ground truth must include the correct diagnosis, key findings, expected body systems, and which specialists should be consulted
- You MUST include "difficultyFactors" listing which specific factors make this case hard

You must respond with valid JSON only (no markdown fences, no extra text).`;

    const userPrompt = `Generate a synthetic rare disease patient case at difficulty ${input.difficulty}/5, using the "${archetype.name}" patient archetype (${archetype.label}).

${diseaseInstruction}

Respond with this exact JSON structure:
{
  "groundTruth": {
    "diagnosis": "Disease Name",
    "icd10": "ICD-10 code or null",
    "prevalence": "e.g., 1 in 50,000",
    "keyFindings": ["finding 1", "finding 2", ...],
    "expectedBodySystems": ["musculoskeletal", "neurological", ...],
    "expectedSpecialists": ["rheumatologist", "neurologist", ...],
    "difficultyFactors": ["nonspecific symptoms", "high diagnostic overlap with X and Y", ...]
  },
  "patient": {
    "narrative": "First-person patient narrative following the ${archetype.name} archetype rules...",
    "demographics": { "age": "34", "sex": "female" },
    "chiefComplaint": "Main reason for visit in patient's words",
    "symptoms": [
      {
        "originalPhrase": "Lay description as patient would say it",
        "medicalTerm": "Proper medical term",
        "bodySystem": "affected body system",
        "severity": "mild|moderate|severe",
        "duration": "e.g., 6 months",
        "mentionedInNarrative": true
      }
    ],
    "medicalHistory": {
      "pastMedicalHistory": [],
      "familyHistory": [],
      "currentMedications": [],
      "recentTests": []
    }
  }
}`;

    const result = await callAnthropic({
      systemPrompt,
      userPrompt,
      maxTokens: 4096,
      temperature: 0.8,
    });

    // Validate the response has the expected structure
    if (!result.content?.groundTruth || !result.content?.patient) {
      console.error(`[${requestId}] Invalid generation response structure:`, typeof result.content);
      return NextResponse.json(
        { error: 'Failed to generate valid patient case — unexpected response format', requestId },
        { status: 500 }
      );
    }

    // Check if the generated diagnosis is in the KB (covers both pre-selected and free-choice)
    const generatedDiagnosis = result.content.groundTruth?.diagnosis?.toLowerCase() || '';
    const isKnowledgeBaseDisease = diseases.some(
      d => d.name.toLowerCase() === generatedDiagnosis || d.aliases.some(a => a.toLowerCase() === generatedDiagnosis)
    );

    return NextResponse.json({
      groundTruth: result.content.groundTruth,
      patient: result.content.patient,
      generationMetadata: {
        model: result.model,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        archetype: archetype.name,
        source: 'generated' as const,
        preSelectedDisease: preSelectedDisease?.name ?? null,
        isKnowledgeBaseDisease,
      },
      requestId,
    });
  } catch (error: any) {
    console.error(`[${requestId}] Generation error:`, error.message);
    return NextResponse.json(
      { error: error.message, requestId },
      { status: 500 }
    );
  }
}
