import { ProviderError } from "../errors.js";
import type { DecisionAnswer, DecisionProvider, DecisionRequest, ProviderResponse, Usage } from "../types.js";

export type FetchLike = typeof fetch;

interface RawProviderPayload {
  answers?: Record<string, DecisionAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    total_cost?: number;
    costUsd?: number;
  };
  cost?: number;
  total_cost?: number;
  costUsd?: number;
  model?: string;
}

export interface HttpProviderOptions {
  name: string;
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  headers?: Record<string, string>;
  fetch?: FetchLike;
  maxRetries?: number;
  timeoutMs?: number;
  pricing?: {
    inputCostPerMillion: number;
    outputCostPerMillion: number;
  };
  transformBody?: (request: DecisionRequest, model: string) => unknown;
  transformResponse?: (body: unknown) => RawProviderPayload;
}

function parseUsage(
  usage: RawProviderPayload["usage"],
  payload: RawProviderPayload,
  pricing: HttpProviderOptions["pricing"],
): Usage | undefined {
  if (!usage) return undefined;
  const reportedCost =
    usage.costUsd ?? usage.cost ?? usage.total_cost ?? payload.costUsd ?? payload.cost ?? payload.total_cost;
  const costUsd =
    typeof reportedCost === "number"
      ? reportedCost
      : pricing
        ? ((usage.input_tokens ?? usage.inputTokens ?? 0) * pricing.inputCostPerMillion +
            (usage.output_tokens ?? usage.outputTokens ?? 0) * pricing.outputCostPerMillion) /
          1_000_000
        : undefined;
  return {
    inputTokens: usage.input_tokens ?? usage.inputTokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.outputTokens ?? 0,
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Request aborted"));
      },
      { once: true },
    );
  });
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

export class HttpDecisionProvider implements DecisionProvider {
  readonly name: string;
  readonly #options: HttpProviderOptions;
  readonly #fetch: FetchLike;

  constructor(options: HttpProviderOptions) {
    if (!options.apiKey) throw new ProviderError(`${options.name} API key is required.`);
    this.name = options.name;
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch;
  }

  async evaluate(request: DecisionRequest): Promise<ProviderResponse> {
    const model = request.model ?? this.#options.defaultModel;
    const startedAt = performance.now();
    const maxRetries = this.#options.maxRetries ?? 2;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await this.#fetch(this.#options.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#options.apiKey}`,
            "Content-Type": "application/json",
            ...this.#options.headers,
          },
          body: JSON.stringify(
            this.#options.transformBody?.(request, model) ?? {
              state: request.state,
              questions: request.questions,
              model,
            },
          ),
          signal: combineSignals(request.signal, this.#options.timeoutMs ?? 30_000),
        });

        if (!response.ok) {
          const responseBody = await response.text().catch(() => "");
          const error = new ProviderError(
            `${this.name} request failed with HTTP ${response.status}${responseBody ? `: ${responseBody.slice(0, 500)}` : ""}`,
            response.status,
            responseBody,
          );
          if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
            lastError = error;
            await sleep(200 * 2 ** attempt, request.signal);
            continue;
          }
          throw error;
        }

        const rawBody: unknown = await response.json();
        const body = this.#options.transformResponse?.(rawBody) ?? (rawBody as RawProviderPayload);
        if (!body.answers || typeof body.answers !== "object") {
          throw new ProviderError(`${this.name} returned a response without an answers object.`);
        }
        const usage = parseUsage(body.usage, body, this.#options.pricing);
        return {
          answers: body.answers,
          provider: this.name,
          model: body.model ?? model,
          ...(usage ? { usage } : {}),
          latencyMs: Math.round(performance.now() - startedAt),
        };
      } catch (error) {
        lastError = error;
        if (error instanceof ProviderError || attempt >= maxRetries) throw error;
        await sleep(200 * 2 ** attempt, request.signal);
      }
    }

    throw lastError instanceof Error ? lastError : new ProviderError(`${this.name} request failed.`);
  }
}
