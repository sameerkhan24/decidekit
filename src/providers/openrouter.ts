import type { DecisionRequest } from "../types.js";
import { type FetchLike, HttpDecisionProvider } from "./http.js";

export interface OpenRouterProviderOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  appName?: string;
  appUrl?: string;
  fetch?: FetchLike;
  maxRetries?: number;
  timeoutMs?: number;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
}

function normalizeModel(model: string): string {
  if (model === "jev-latest") return "typesafe/jev-1.13";
  if (model.startsWith("~typesafe/") || model.startsWith("typesafe/")) return model;
  return `typesafe/${model}`;
}

export class OpenRouterProvider extends HttpDecisionProvider {
  constructor(options: OpenRouterProviderOptions = {}) {
    const appName = options.appName ?? "DecideKit";
    const appUrl = options.appUrl ?? "https://www.npmjs.com/package/decidekit";
    const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    const fetchOption = options.fetch ? { fetch: options.fetch } : {};
    const retriesOption = options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries };
    const timeoutOption = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
    super({
      name: "openrouter",
      endpoint: options.endpoint ?? "https://openrouter.ai/api/alpha/decisions",
      apiKey,
      defaultModel: normalizeModel(options.model ?? "typesafe/jev-1.13"),
      headers: {
        "HTTP-Referer": appUrl,
        "X-OpenRouter-Title": appName,
      },
      ...fetchOption,
      ...retriesOption,
      ...timeoutOption,
      pricing: {
        inputCostPerMillion: options.inputCostPerMillion ?? 0.042,
        outputCostPerMillion: options.outputCostPerMillion ?? 0,
      },
      transformBody: (request: DecisionRequest, model: string) => ({
        model: normalizeModel(model),
        state: request.state,
        questions: request.questions,
      }),
    });
  }
}
