class DecideKitError(Exception):
    """Base error for DecideKit."""


class PolicyValidationError(DecideKitError):
    """A policy is malformed or violates the policy contract."""


class ProviderError(DecideKitError):
    """A decision provider failed or returned an invalid response."""

    def __init__(self, message: str, status: int | None = None, response_body: str | None = None):
        super().__init__(message)
        self.status = status
        self.response_body = response_body


class UncertainDecisionError(DecideKitError):
    """A result fell below its confidence threshold without a fallback."""

    def __init__(self, decision_id: str, confidence: float, threshold: float):
        super().__init__(
            f'Decision "{decision_id}" was uncertain: confidence '
            f"{confidence:.3f} is below {threshold:.3f} and no fallback is configured."
        )
        self.decision_id = decision_id
        self.confidence = confidence
        self.threshold = threshold
