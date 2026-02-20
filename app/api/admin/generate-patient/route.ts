import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { callAnthropic } from '@/lib/anthropic';
import { loadDiseaseDatabase } from '@/lib/knowledge/index';

const inputSchema = z.object({
  difficulty: z.number().min(1).max(5),
  categoryHint: z.string().optional(),
  excludeDiseases: z.array(z.string()).optional(),
});

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
    // Load KB disease names for context
    const diseases = loadDiseaseDatabase();
    const diseaseNames = diseases.map(d => d.name);
    const excludeSet = new Set(input.excludeDiseases || []);
    const availableDiseases = diseaseNames.filter(n => !excludeSet.has(n));

    const difficultyDescriptions: Record<number, string> = {
      1: 'EASY — Textbook presentation. Classic, well-described symptoms. Clear symptom descriptions using common lay terms. Patient is articulate and organized. Choose a disease FROM the knowledge base list below.',
      2: 'MODERATE — Mostly typical presentation with one or two less common features. Patient uses clear lay language. Choose a disease FROM the knowledge base list below.',
      3: 'CHALLENGING — Atypical features present. Patient uses vague, layperson descriptions. Some symptoms described indirectly (e.g., "my hands feel weird in the morning" instead of "morning stiffness"). May include mild comorbidities that complicate the picture. Can use a disease from the KB or outside it.',
      4: 'HARD — Early or evolving presentation where not all classic features are present yet. Patient is somewhat disorganized. Includes 1-2 red herrings (real symptoms that point away from the true diagnosis). May use a disease NOT in the knowledge base.',
      5: 'EXPERT — Very early presentation with minimal classic features. Patient narrative is disorganized and includes multiple red herrings. Symptoms are described in non-medical, vague terms. Consider rare variants or atypical subtypes. Likely uses a disease NOT in the knowledge base.',
    };

    const categoryInstruction = input.categoryHint
      ? `\nFocus on diseases in the "${input.categoryHint}" category or body system.`
      : '';

    const systemPrompt = `You are a clinical simulation specialist creating synthetic rare disease patient presentations for a diagnostic AI testing framework.

Your task: Generate a realistic first-person patient narrative and structured clinical data for a rare disease case at difficulty level ${input.difficulty}/5.

${difficultyDescriptions[input.difficulty]}${categoryInstruction}

IMPORTANT RULES:
- The narrative should be ~800-1200 characters, written as a patient would actually describe their symptoms to a doctor
- Include realistic demographics (age, sex) that match the epidemiology of the chosen disease
- Generate 4-8 symptoms with proper medical terms AND the lay descriptions the patient would use
- Include relevant medical history, family history, and medications where appropriate
- The ground truth must include the correct diagnosis, key findings, expected body systems, and which specialists should be consulted

You must respond with valid JSON only (no markdown fences, no extra text).`;

    const userPrompt = `Generate a synthetic rare disease patient case at difficulty ${input.difficulty}/5.

Knowledge base diseases available (${availableDiseases.length} total):
${availableDiseases.join(', ')}

Respond with this exact JSON structure:
{
  "groundTruth": {
    "diagnosis": "Disease Name",
    "icd10": "ICD-10 code or null",
    "prevalence": "e.g., 1 in 50,000",
    "keyFindings": ["finding 1", "finding 2", ...],
    "expectedBodySystems": ["musculoskeletal", "neurological", ...],
    "expectedSpecialists": ["rheumatologist", "neurologist", ...]
  },
  "patient": {
    "narrative": "First-person patient narrative...",
    "demographics": { "age": "34", "sex": "female" },
    "chiefComplaint": "Main reason for visit in patient's words",
    "symptoms": [
      {
        "originalPhrase": "Lay description as patient would say it",
        "medicalTerm": "Proper medical term",
        "bodySystem": "affected body system",
        "severity": "mild|moderate|severe",
        "duration": "e.g., 6 months"
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

    return NextResponse.json({
      groundTruth: result.content.groundTruth,
      patient: result.content.patient,
      generationMetadata: {
        model: result.model,
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
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
