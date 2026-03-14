// Cost estimates per 1K tokens (in cents) — approximate as of 2026
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 0.2, output: 0.8 },
  'gpt-4.1-mini': { input: 0.04, output: 0.16 },
  'gpt-4.1-nano': { input: 0.01, output: 0.04 },
  'gpt-4o': { input: 0.25, output: 1.0 },
  'gpt-4o-mini': { input: 0.015, output: 0.06 },
  'o3': { input: 1.0, output: 4.0 },
  'o4-mini': { input: 0.11, output: 0.44 },
};

export class BudgetTracker {
  private totalTokens = 0;
  private stages: Array<{ model: string; tokens: number; estimatedCostCents: number }> = [];

  addUsage(model: string, tokensUsed: number): void {
    const costs = MODEL_COSTS[model] || MODEL_COSTS['gpt-4.1'];
    // Rough estimate: assume 60% input, 40% output
    const inputTokens = tokensUsed * 0.6;
    const outputTokens = tokensUsed * 0.4;
    const costCents = (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;

    this.totalTokens += tokensUsed;
    this.stages.push({ model, tokens: tokensUsed, estimatedCostCents: costCents });
  }

  estimatedCostCents(): number {
    return this.stages.reduce((sum, s) => sum + s.estimatedCostCents, 0);
  }

  totalTokensUsed(): number {
    return this.totalTokens;
  }

  estimatedCostDollars(): number {
    return this.estimatedCostCents() / 100;
  }

  getSummary(): { totalTokens: number; totalCostCents: number; stages: Array<{ model: string; tokens: number; estimatedCostCents: number }> } {
    return {
      totalTokens: this.totalTokens,
      totalCostCents: Math.round(this.estimatedCostCents() * 100) / 100,
      stages: this.stages,
    };
  }
}
