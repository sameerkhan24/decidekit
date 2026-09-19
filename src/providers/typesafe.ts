import { type FetchLike, HttpDecisionProvider } from "./http.js";

function normalizeModel(model: string): string {
  return model.replace(/^~?typesafe\//, "");
}

export interface TypeSafeProviderOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetch?: FetchLike;
  maxRetries?: number;
  timeoutMs?: number;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
}

export class TypeSafeProvider extends HttpDecisionProvider {
  constructor(options: TypeSafeProviderOptions = {}) {
    const fetchOption = options.fetch ? { fetch: options.fetch } : {};
    const retriesOption = options.maxRetries === undefined ? {} : { maxRetries: options.maxRetries };
    const timeoutOption = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
    super({
      name: "typesafe",
      endpoint: options.endpoint ?? "https://api.typesafe.ai/v1/systemone",
      apiKey: options.apiKey ?? process.env.TYPESAFE_API_KEY ?? "",
      defaultModel: normalizeModel(options.model ?? "jev-latest"),
      ...fetchOption,
      ...retriesOption,
      ...timeoutOption,
      pricing: {
        inputCostPerMillion: options.inputCostPerMillion ?? 0.042,
        outputCostPerMillion: options.outputCostPerMillion ?? 0,
      },
      transformBody: (request, model) => ({
        state: request.state,
        questions: request.questions,
        model: normalizeModel(model),
      }),
    });
  }
}
