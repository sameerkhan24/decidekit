from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Generic, TypeVar

from .errors import DecideKitError, UncertainDecisionError
from .types import (
    ChoiceDefinition,
    DecisionDefinition,
    DecisionProvider,
    DecisionQuestion,
    JsonValue,
    NoulDefinition,
    Policy,
    ProviderResponse,
    ScoreDefinition,
    Usage,
)

T = TypeVar("T", str, float, bool)


@dataclass(frozen=True)
class DecisionResult(Generic[T]):
    id: str
    type: str
    value: T
    raw_value: T
    confidence: float
    certain: bool
    fallback_applied: bool
    provider: str
    model: str
    probabilities: dict[str, float] | list[float] | None = None
    latency_ms: int | None = None
    usage: Usage | None = None
    invocation_cost_usd: float | None = None

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["rawValue"] = result.pop("raw_value")
        result["fallbackApplied"] = result.pop("fallback_applied")
        result["latencyMs"] = result.pop("latency_ms")
        result["usage"] = self.usage.to_dict() if self.usage else None
        result["invocationCostUsd"] = result.pop("invocation_cost_usd")
        return {key: value for key, value in result.items() if value is not None}


def _question(definition: DecisionDefinition) -> DecisionQuestion:
    if isinstance(definition, ChoiceDefinition):
        return DecisionQuestion("choice", definition.question, definition.choices)
    if isinstance(definition, ScoreDefinition):
        return DecisionQuestion("score", definition.question, definition.levels)
    return DecisionQuestion("noul", definition.question)


def _confidence(answer: dict[str, Any]) -> float:
    if answer.get("type") == "noul":
        probability = float(answer.get("noul"))
        if not 0 <= probability <= 1:
            raise DecideKitError("Provider returned a Noul probability outside 0..1")
        return max(probability, 1 - probability)
    value = answer.get("confidence")
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
        raise DecideKitError("Provider returned an invalid confidence value")
    return float(value)


def _raw_value(answer: dict[str, Any]) -> str | float | bool:
    kind = answer.get("type")
    if kind == "choice":
        return str(answer["choice"])
    if kind == "score":
        return float(answer["score"])
    if kind == "noul":
        return float(answer["noul"]) >= 0.5
    raise DecideKitError(f"Provider returned an unknown answer type: {kind!r}")


def _fallback(definition: DecisionDefinition) -> str | float | bool | None:
    return definition.fallback


class DecideKit:
    def __init__(self, policy: Policy, provider: DecisionProvider, model: str | None = None):
        self.policy = policy
        self.provider = provider
        self.model = model

    def decide(self, decision_id: str, state: JsonValue, model: str | None = None) -> DecisionResult[Any]:
        return self.evaluate([decision_id], state, model=model)["decisions"][decision_id]

    def evaluate(
        self,
        ids: list[str] | tuple[str, ...] | str,
        state: JsonValue,
        model: str | None = None,
    ) -> dict[str, Any]:
        selected = list(self.policy.decisions) if ids == "all" else list(dict.fromkeys(ids))
        if not selected:
            raise DecideKitError("At least one decision id is required")
        definitions: dict[str, DecisionDefinition] = {}
        questions: dict[str, DecisionQuestion] = {}
        for decision_id in selected:
            definition = self.policy.decisions.get(decision_id)
            if definition is None:
                raise DecideKitError(f'Decision "{decision_id}" does not exist in the policy')
            definitions[decision_id] = definition
            questions[decision_id] = _question(definition)

        response: ProviderResponse = self.provider.evaluate(
            state,
            questions,
            model=model or self.model or self.policy.model,
        )
        decisions: dict[str, DecisionResult[Any]] = {}
        for decision_id in selected:
            definition = definitions[decision_id]
            answer = response.answers.get(decision_id)
            if answer is None:
                raise DecideKitError(f'Provider did not return an answer for "{decision_id}"')
            if answer.get("type") != definition.type:
                raise DecideKitError(
                    f'Provider returned a {answer.get("type")} answer for "{decision_id}", '
                    f"but the policy defines {definition.type}"
                )
            raw_value = _raw_value(answer)
            if isinstance(definition, ChoiceDefinition) and raw_value not in definition.choices:
                raise DecideKitError(f'Provider returned unknown choice "{raw_value}" for "{decision_id}"')
            confidence = _confidence(answer)
            threshold = definition.min_confidence
            threshold = self.policy.default_min_confidence if threshold is None else threshold
            certain = confidence >= threshold
            fallback = _fallback(definition)
            if not certain and fallback is None:
                raise UncertainDecisionError(decision_id, confidence, threshold)
            probabilities = answer.get("probabilities") if definition.type in {"choice", "score"} else None
            decisions[decision_id] = DecisionResult(
                id=decision_id,
                type=definition.type,
                value=raw_value if certain else fallback,
                raw_value=raw_value,
                confidence=confidence,
                certain=certain,
                fallback_applied=not certain,
                probabilities=probabilities,
                provider=response.provider,
                model=response.model,
                latency_ms=response.latency_ms,
                usage=response.usage,
                invocation_cost_usd=response.usage.cost_usd if response.usage else None,
            )
        return {
            "decisions": {key: value for key, value in decisions.items()},
            "provider": response.provider,
            "model": response.model,
            "latencyMs": response.latency_ms,
            "usage": response.usage.to_dict() if response.usage else None,
            "costUsd": response.usage.cost_usd if response.usage else None,
        }
