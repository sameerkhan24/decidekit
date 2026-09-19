import { DecideKitError, UncertainDecisionError } from "./errors.js";
import type {
  BatchDecisionResult,
  DecideKitPolicy,
  DecisionAnswer,
  DecisionDefinition,
  DecisionProvider,
  DecisionQuestion,
  DecisionResult,
  JsonValue,
  ProviderResponse,
} from "./types.js";

export interface DecideKitOptions {
  provider: DecisionProvider;
  policy: DecideKitPolicy;
  model?: string;
}

export interface EvaluateOptions {
  signal?: AbortSignal;
  model?: string;
}

function toQuestion(definition: DecisionDefinition): DecisionQuestion {
  switch (definition.type) {
    case "choice":
      return { type: "choice", instructions: definition.question, criteria: definition.choices };
    case "score":
      return { type: "score", instructions: definition.question, criteria: definition.levels };
    case "noul":
      return { type: "noul", instructions: definition.question };
  }
}

function answerConfidence(answer: DecisionAnswer): number {
  if (answer.type === "noul") return Math.max(answer.noul, 1 - answer.noul);
  return answer.confidence;
}

function answerValue(answer: DecisionAnswer): string | number | boolean {
  switch (answer.type) {
    case "choice":
      return answer.choice;
    case "score":
      return answer.score;
    case "noul":
      return answer.noul >= 0.5;
  }
}

function fallbackValue(definition: DecisionDefinition): string | number | boolean | undefined {
  return definition.fallback;
}

function assertAnswerMatches(id: string, definition: DecisionDefinition, answer: DecisionAnswer): void {
  if (definition.type !== answer.type) {
    throw new DecideKitError(
      `Provider returned a ${answer.type} answer for "${id}", but the policy defines ${definition.type}.`,
    );
  }
  if (definition.type === "choice" && answer.type === "choice" && !(answer.choice in definition.choices)) {
    throw new DecideKitError(`Provider returned unknown choice "${answer.choice}" for decision "${id}".`);
  }
}

function makeResult(
  id: string,
  definition: DecisionDefinition,
  answer: DecisionAnswer,
  response: ProviderResponse,
  defaultThreshold: number,
): DecisionResult {
  assertAnswerMatches(id, definition, answer);
  const rawValue = answerValue(answer);
  const confidence = answerConfidence(answer);
  const threshold = definition.minConfidence ?? defaultThreshold;
  const certain = confidence >= threshold;
  const fallback = fallbackValue(definition);
  if (!certain && fallback === undefined) {
    throw new UncertainDecisionError(id, confidence, threshold);
  }
  return {
    id,
    type: definition.type,
    value: certain ? rawValue : fallback,
    rawValue,
    confidence,
    certain,
    fallbackApplied: !certain,
    ...(answer.type === "choice" || answer.type === "score" ? { probabilities: answer.probabilities } : {}),
    provider: response.provider,
    model: response.model,
    ...(response.latencyMs === undefined ? {} : { latencyMs: response.latencyMs }),
    ...(response.usage === undefined ? {} : { usage: response.usage }),
    ...(response.usage?.costUsd === undefined ? {} : { invocationCostUsd: response.usage.costUsd }),
  } as DecisionResult;
}

export class DecideKit {
  readonly provider: DecisionProvider;
  readonly policy: DecideKitPolicy;
  readonly model: string | undefined;

  constructor(options: DecideKitOptions) {
    this.provider = options.provider;
    this.policy = options.policy;
    this.model = options.model;
  }

  async decide<T = string | number | boolean>(
    id: string,
    state: JsonValue,
    options: EvaluateOptions = {},
  ): Promise<DecisionResult<T>> {
    const batch = await this.evaluate([id], state, options);
    return batch.decisions[id] as DecisionResult<T>;
  }

  async evaluate(
    ids: string[] | "all",
    state: JsonValue,
    options: EvaluateOptions = {},
  ): Promise<BatchDecisionResult> {
    const selectedIds = ids === "all" ? Object.keys(this.policy.decisions) : [...new Set(ids)];
    if (selectedIds.length === 0) throw new DecideKitError("At least one decision id is required.");

    const questions: Record<string, DecisionQuestion> = {};
    for (const id of selectedIds) {
      const definition = this.policy.decisions[id];
      if (!definition) throw new DecideKitError(`Decision "${id}" does not exist in the policy.`);
      questions[id] = toQuestion(definition);
    }

    const response = await this.provider.evaluate({
      state,
      questions,
      ...((options.model ?? this.model ?? this.policy.model)
        ? { model: options.model ?? this.model ?? this.policy.model }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    const defaultThreshold = this.policy.defaults?.minConfidence ?? 0;
    const decisions: Record<string, DecisionResult> = {};
    for (const id of selectedIds) {
      const answer = response.answers[id];
      const definition = this.policy.decisions[id];
      if (!answer || !definition) throw new DecideKitError(`Provider did not return an answer for "${id}".`);
      decisions[id] = makeResult(id, definition, answer, response, defaultThreshold);
    }

    return {
      decisions,
      provider: response.provider,
      model: response.model,
      ...(response.latencyMs === undefined ? {} : { latencyMs: response.latencyMs }),
      ...(response.usage === undefined ? {} : { usage: response.usage }),
      ...(response.usage?.costUsd === undefined ? {} : { costUsd: response.usage.costUsd }),
    };
  }
}
