import { z } from 'zod';

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  UMLS_API_KEY: z.string().min(1, 'UMLS_API_KEY is required').optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  ANALYSIS_BUDGET_CENTS: z.string().transform(Number).pipe(z.number().min(10).max(1000)).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function validateEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    console.error('[ENV] Validation failed:', missing);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export function getAnalysisBudgetCents(): number {
  const env = validateEnv();
  return env.ANALYSIS_BUDGET_CENTS ?? 100;
}
