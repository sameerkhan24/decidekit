from __future__ import annotations

import os

from ..types import DecisionQuestion, JsonValue
from .http import HttpDecisionProvider, Transport


def normalize_model(model: str) -> str:
    return model.removeprefix("~typesafe/").removeprefix("typesafe/")


class TypeSafeProvider(HttpDecisionProvider):
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "jev-latest",
        *,
        endpoint: str = "https://api.typesafe.ai/v1/systemone",
        max_retries: int = 2,
        timeout: float = 30.0,
        input_cost_per_million: float = 0.042,
        output_cost_per_million: float = 0.0,
        transport: Transport | None = None,
    ):
        super().__init__(
            name="typesafe",
            endpoint=endpoint,
            api_key=api_key or os.environ.get("TYPESAFE_API_KEY", ""),
            default_model=normalize_model(model),
            max_retries=max_retries,
            timeout=timeout,
            input_cost_per_million=input_cost_per_million,
            output_cost_per_million=output_cost_per_million,
            transport=transport,
            transform_body=lambda state, questions, effective_model: {
                "model": normalize_model(effective_model),
                "state": state,
                "questions": {key: value.to_payload() for key, value in questions.items()},
            },
        )
