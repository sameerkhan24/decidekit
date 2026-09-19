from __future__ import annotations

import os
from typing import Any

from ..types import DecisionQuestion, JsonValue
from .http import HttpDecisionProvider, Transport


def normalize_model(model: str) -> str:
    if model == "jev-latest":
        return "typesafe/jev-1.13"
    if model.startswith(("typesafe/", "~typesafe/")):
        return model
    return f"typesafe/{model}"


class OpenRouterProvider(HttpDecisionProvider):
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "typesafe/jev-1.13",
        *,
        endpoint: str = "https://openrouter.ai/api/alpha/decisions",
        app_name: str = "DecideKit",
        app_url: str = "https://www.npmjs.com/package/decidekit",
        max_retries: int = 2,
        timeout: float = 30.0,
        input_cost_per_million: float = 0.042,
        output_cost_per_million: float = 0.0,
        transport: Transport | None = None,
    ):
        super().__init__(
            name="openrouter",
            endpoint=endpoint,
            api_key=api_key or os.environ.get("OPENROUTER_API_KEY", ""),
            default_model=normalize_model(model),
            headers={"HTTP-Referer": app_url, "X-OpenRouter-Title": app_name},
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
