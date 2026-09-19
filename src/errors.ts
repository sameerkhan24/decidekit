export class DecideKitError extends Error {
  override readonly name: string = "DecideKitError";
}

export class PolicyValidationError extends DecideKitError {
  override readonly name = "PolicyValidationError";
}

export class ProviderError extends DecideKitError {
  override readonly name = "ProviderError";

  constructor(
    message: string,
    readonly status?: number,
    readonly responseBody?: string,
  ) {
    super(message);
  }
}

export class UncertainDecisionError extends DecideKitError {
  override readonly name = "UncertainDecisionError";

  constructor(
    readonly decisionId: string,
    readonly confidence: number,
    readonly threshold: number,
  ) {
    super(
      `Decision "${decisionId}" was uncertain: confidence ${confidence.toFixed(3)} is below ${threshold.toFixed(3)} and no fallback is configured.`,
    );
  }
}
