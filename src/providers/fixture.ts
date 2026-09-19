import { ProviderError } from "../errors.js";
import type { DecisionAnswer, DecisionProvider, DecisionRequest, ProviderResponse } from "../types.js";

export interface FixtureProviderOptions {
  answers: Record<string, DecisionAnswer>;
  name?: string;
  model?: string;
  latencyMs?: number;
}

export class FixtureProvider implements DecisionProvider {
  readonly name: string;
  readonly #answers: Record<string, DecisionAnswer>;
  readonly #model: string;
  readonly #latencyMs: number;

  constructor(options: FixtureProviderOptions) {
    this.name = options.name ?? "fixture";
    this.#answers = options.answers;
    this.#model = options.model ?? "fixture-v1";
    this.#latencyMs = options.latencyMs ?? 0;
  }

  async evaluate(request: DecisionRequest): Promise<ProviderResponse> {
    const answers: Record<string, DecisionAnswer> = {};
    for (const id of Object.keys(request.questions)) {
      const answer = this.#answers[id];
      if (!answer) throw new ProviderError(`Fixture does not contain an answer for "${id}".`);
      answers[id] = structuredClone(answer);
    }
    return {
      answers,
      provider: this.name,
      model: request.model ?? this.#model,
      latencyMs: this.#latencyMs,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }
}
