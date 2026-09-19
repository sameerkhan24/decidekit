export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, JsonValue>;
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: JsonValue[];
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

export type DecisionQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export interface DecisionRequest {
  state: JsonValue;
  questions: Record<string, DecisionQuestion>;
  model?: string;
  signal?: AbortSignal;
}

export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  probabilities: Record<string, number> | number[];
  confidence: number;
}

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export type DecisionAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export interface ProviderResponse {
  answers: Record<string, DecisionAnswer>;
  provider: string;
  model: string;
  usage?: Usage;
  latencyMs?: number;
}

export interface DecisionProvider {
  readonly name: string;
  evaluate(request: DecisionRequest): Promise<ProviderResponse>;
}

export interface ChoiceDefinition {
  type: "choice";
  question: string;
  choices: Record<string, JsonValue>;
  minConfidence?: number;
  fallback?: string;
}

export interface ScoreDefinition {
  type: "score";
  question: string;
  levels: JsonValue[];
  minConfidence?: number;
  fallback?: number;
}

export interface NoulDefinition {
  type: "noul";
  question: string;
  minConfidence?: number;
  fallback?: boolean;
}

export type DecisionDefinition = ChoiceDefinition | ScoreDefinition | NoulDefinition;

export interface DecideKitPolicy {
  version: 1;
  name?: string;
  description?: string;
  model?: string;
  defaults?: {
    minConfidence?: number;
  };
  decisions: Record<string, DecisionDefinition>;
}

export interface DecisionResult<T = string | number | boolean> {
  id: string;
  type: DecisionDefinition["type"];
  value: T;
  rawValue: T;
  confidence: number;
  certain: boolean;
  fallbackApplied: boolean;
  probabilities?: Record<string, number> | number[];
  provider: string;
  model: string;
  latencyMs?: number;
  usage?: Usage;
  /** Total cost of the provider invocation that produced this result. */
  invocationCostUsd?: number;
}

export interface BatchDecisionResult {
  decisions: Record<string, DecisionResult>;
  provider: string;
  model: string;
  latencyMs?: number;
  usage?: Usage;
  /** Total cost of this provider invocation, shared by all batched decisions. */
  costUsd?: number;
}
