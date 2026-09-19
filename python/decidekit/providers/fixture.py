from __future__ import annotations

from copy import deepcopy

from ..errors import ProviderError
from ..types import DecisionQuestion, DecisionProvider, JsonValue, ProviderResponse, Usage


class FixtureProvider:
    name = "fixture"

    def __init__(self, answers: dict[str, dict], model: str = "fixture-v1", latency_ms: int = 0):
        self.answers = answers
        self.model = model
        self.latency_ms = latency_ms

    def evaluate(
        self,
        state: JsonValue,
        questions: dict[str, DecisionQuestion],
        model: str | None = None,
    ) -> ProviderResponse:
        answers: dict[str, dict] = {}
        for decision_id in questions:
            if decision_id not in self.answers:
                raise ProviderError(f'Fixture does not contain an answer for "{decision_id}"')
            answers[decision_id] = deepcopy(self.answers[decision_id])
        return ProviderResponse(
            answers=answers,
            provider=self.name,
            model=model or self.model,
            usage=Usage(cost_usd=0.0),
            latency_ms=self.latency_ms,
        )
