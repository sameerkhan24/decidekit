from __future__ import annotations

import json
import time
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ..errors import ProviderError
from ..types import DecisionQuestion, JsonValue, ProviderResponse, Usage

Transport = Callable[[Request, float], Any]


class HttpDecisionProvider:
    def __init__(
        self,
        *,
        name: str,
        endpoint: str,
        api_key: str,
        default_model: str,
        headers: dict[str, str] | None = None,
        max_retries: int = 2,
        timeout: float = 30.0,
        input_cost_per_million: float | None = None,
        output_cost_per_million: float | None = None,
        transport: Transport | None = None,
        transform_body: Callable[[JsonValue, dict[str, DecisionQuestion], str], dict[str, Any]] | None = None,
    ):
        if not api_key:
            raise ProviderError(f"{name} API key is required")
        self.name = name
        self.endpoint = endpoint
        self.api_key = api_key
        self.default_model = default_model
        self.headers = headers or {}
        self.max_retries = max_retries
        self.timeout = timeout
        self.input_cost_per_million = input_cost_per_million
        self.output_cost_per_million = output_cost_per_million
        # urlopen's second positional argument is request data, not timeout.
        # Keep the injected transport contract as (request, timeout) while
        # adapting the standard-library function correctly.
        self.transport = transport or (lambda request, timeout: urlopen(request, timeout=timeout))
        self.transform_body = transform_body

    def evaluate(
        self,
        state: JsonValue,
        questions: dict[str, DecisionQuestion],
        model: str | None = None,
    ) -> ProviderResponse:
        effective_model = model or self.default_model
        body = (
            self.transform_body(state, questions, effective_model)
            if self.transform_body
            else {"state": state, "questions": {key: value.to_payload() for key, value in questions.items()}, "model": effective_model}
        )
        request = Request(
            self.endpoint,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                **self.headers,
            },
        )
        started = time.perf_counter()
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with self.transport(request, self.timeout) as response:
                    raw = response.read().decode("utf-8")
                parsed = json.loads(raw)
                answers = parsed.get("answers")
                if not isinstance(answers, dict):
                    raise ProviderError(f"{self.name} returned a response without an answers object")
                usage_data = parsed.get("usage") or {}
                reported_cost = usage_data.get("costUsd", usage_data.get("cost", usage_data.get("total_cost")))
                if reported_cost is None:
                    reported_cost = parsed.get("costUsd", parsed.get("cost", parsed.get("total_cost")))
                cost_usd = float(reported_cost) if reported_cost is not None else None
                if cost_usd is None and self.input_cost_per_million is not None and self.output_cost_per_million is not None:
                    cost_usd = (
                        int(usage_data.get("input_tokens", usage_data.get("inputTokens", 0))) * self.input_cost_per_million
                        + int(usage_data.get("output_tokens", usage_data.get("outputTokens", 0))) * self.output_cost_per_million
                    ) / 1_000_000
                usage = Usage(
                    int(usage_data.get("input_tokens", usage_data.get("inputTokens", 0))),
                    int(usage_data.get("output_tokens", usage_data.get("outputTokens", 0))),
                    cost_usd,
                )
                return ProviderResponse(
                    answers=answers,
                    provider=self.name,
                    model=str(parsed.get("model", effective_model)),
                    usage=usage,
                    latency_ms=round((time.perf_counter() - started) * 1000),
                )
            except HTTPError as error:
                response_body = error.read().decode("utf-8", errors="replace")
                last_error = ProviderError(
                    f"{self.name} request failed with HTTP {error.code}: {response_body[:500]}",
                    error.code,
                    response_body,
                )
                if error.code not in {429, 500, 502, 503, 504} or attempt >= self.max_retries:
                    raise last_error from error
            except (URLError, TimeoutError, json.JSONDecodeError) as error:
                last_error = ProviderError(f"{self.name} request failed: {error}")
                if attempt >= self.max_retries:
                    raise last_error from error
            if last_error is not None:
                time.sleep(0.2 * (2**attempt))
        raise last_error or ProviderError(f"{self.name} request failed")
