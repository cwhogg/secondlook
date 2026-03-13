import { z } from 'zod';

const bodySystemEnum = z.enum([
  'neurological', 'musculoskeletal', 'cardiovascular', 'respiratory',
  'gastrointestinal', 'dermatological', 'ophthalmological', 'endocrine',
  'hematological', 'immunological', 'renal', 'reproductive',
  'psychiatric', 'constitutional', 'otolaryngological',
]);

const symptomFrequencySchema = z.object({
  symptomName: z.string().min(1),
  snomedCode: z.string().optional(),
  frequency: z.number().min(0).max(1),
  bodySystem: bodySystemEnum,
  notes: z.string().optional(),
  searchTerms: z.array(z.string()).optional(),
});

const diagnosticCriterionSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(['major', 'minor', 'supportive']),
  requiredForDiagnosis: z.boolean(),
});

export const diseaseProfileSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  icd10Codes: z.array(z.string()),
  omimId: z.string().optional(),
  orphanetId: z.string().optional(),

  prevalence: z.object({
    estimate: z.string().min(1),
    range: z.string().optional(),
    classification: z.enum(['ultra-rare', 'rare', 'uncommon', 'common']),
  }),

  demographics: z.object({
    typicalOnsetAge: z.object({
      min: z.number().min(0).max(120),
      max: z.number().min(0).max(120),
      peak: z.number().min(0).max(120).optional(),
    }),
    sexPredilection: z.enum(['male', 'female', 'equal', 'slight-female', 'slight-male']),
    ethnicAssociations: z.array(z.string()).optional(),
  }),

  diagnosticCriteria: z.object({
    formalCriteriaName: z.string().optional(),
    criteria: z.array(diagnosticCriterionSchema),
    minimumForDiagnosis: z.string().optional(),
    notes: z.string().optional(),
  }),

  symptoms: z.object({
    pathognomonic: z.array(symptomFrequencySchema),
    common: z.array(symptomFrequencySchema),
    occasional: z.array(symptomFrequencySchema),
    rare: z.array(symptomFrequencySchema),
  }),

  systemsAffected: z.array(bodySystemEnum).min(1),

  keyFindings: z.object({
    laboratory: z.array(z.string()),
    imaging: z.array(z.string()),
    genetic: z.array(z.string()),
    other: z.array(z.string()),
  }),

  differentialDiagnoses: z.array(z.object({
    diseaseId: z.string(),
    distinguishingFeatures: z.array(z.string()),
  })),

  redFlags: z.array(z.string()),
  specialistType: z.array(z.string()).min(1),

  lastUpdated: z.string(),
  references: z.array(z.string()),
  confidenceInData: z.enum(['high', 'medium', 'low', 'ai-generated']),
});

export type ValidatedDiseaseProfile = z.infer<typeof diseaseProfileSchema>;

export function validateDiseaseProfile(data: unknown): { success: true; data: ValidatedDiseaseProfile } | { success: false; errors: string[] } {
  const result = diseaseProfileSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`
  );
  return { success: false, errors };
}
