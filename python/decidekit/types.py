from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, TypeAlias

JsonValue: TypeAlias = str | int | float | bool | None | list[Any] | dict[str, Any]


@dataclass(frozen=True)
class DecisionQuestion:
    type: str
    instructions: str
    criteria: dict[str, Any] | list[Any] | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"type": self.type, "instructions": self.instructions}
        if self.criteria is not None:
            payload["criteria"] = self.criteria
        return payload


@dataclass(frozen=True)
class ChoiceDefinition:
    type: str
    question: str
    choices: dict[str, Any]
    min_confidence: float | None = None
    fallback: str | None = None


@dataclass(frozen=True)
class ScoreDefinition:
    type: str
    question: str
    levels: list[Any]
    min_confidence: float | None = None
    fallback: float | None = None


@dataclass(frozen=True)
class NoulDefinition:
    type: str
    question: str
    min_confidence: float | None = None
    fallback: bool | None = None


DecisionDefinition: TypeAlias = ChoiceDefinition | ScoreDefinition | NoulDefinition


@dataclass(frozen=True)
class Policy:
    version: int
    decisions: dict[str, DecisionDefinition]
    name: str | None = None
    description: str | None = None
    model: str | None = None
    default_min_confidence: float = 0.0


@dataclass(frozen=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float | None = None

    def to_dict(self) -> dict[str, int]:
        result: dict[str, int | float] = {"inputTokens": self.input_tokens, "outputTokens": self.output_tokens}
        if self.cost_usd is not None:
            result["costUsd"] = self.cost_usd
        return result


@dataclass(frozen=True)
class ProviderResponse:
    answers: dict[str, dict[str, Any]]
    provider: str
    model: str
    usage: Usage | None = None
    latency_ms: int | None = None


class DecisionProvider(Protocol):
    name: str

    def evaluate(
        self,
        state: JsonValue,
        questions: dict[str, DecisionQuestion],
        model: str | None = None,
    ) -> ProviderResponse:
        ...
