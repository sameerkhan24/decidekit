from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml

from .errors import PolicyValidationError
from .types import ChoiceDefinition, NoulDefinition, Policy, ScoreDefinition


def _mapping(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise PolicyValidationError(f"{path} must be an object")
    return value


def _confidence(value: Any, path: str) -> float | None:
    if value is None:
        return None
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
        raise PolicyValidationError(f"{path} must be a number between 0 and 1")
    return float(value)


def parse_policy(value: Any) -> Policy:
    root = _mapping(value, "policy")
    if root.get("version") != 1:
        raise PolicyValidationError('policy.version must be 1')

    defaults = root.get("defaults") or {}
    defaults = _mapping(defaults, "policy.defaults")
    default_min = _confidence(defaults.get("minConfidence"), "policy.defaults.minConfidence")
    decisions_input = _mapping(root.get("decisions"), "policy.decisions")
    decisions: dict[str, ChoiceDefinition | ScoreDefinition | NoulDefinition] = {}

    for decision_id, raw in decisions_input.items():
        if not isinstance(decision_id, str) or not decision_id:
            raise PolicyValidationError("decision ids must be non-empty strings")
        definition = _mapping(raw, f"decisions.{decision_id}")
        kind = definition.get("type")
        question = definition.get("question")
        if not isinstance(question, str) or not question.strip():
            raise PolicyValidationError(f"decisions.{decision_id}.question must be a non-empty string")
        confidence = _confidence(definition.get("minConfidence"), f"decisions.{decision_id}.minConfidence")

        if kind == "choice":
            choices = _mapping(definition.get("choices"), f"decisions.{decision_id}.choices")
            if len(choices) < 2:
                raise PolicyValidationError(f"decisions.{decision_id}.choices needs at least two choices")
            fallback = definition.get("fallback")
            if fallback is not None and (not isinstance(fallback, str) or fallback not in choices):
                raise PolicyValidationError(f"decisions.{decision_id}.fallback must be one of its choices")
            decisions[decision_id] = ChoiceDefinition("choice", question, choices, confidence, fallback)
        elif kind == "score":
            levels = definition.get("levels")
            if not isinstance(levels, list) or not 2 <= len(levels) <= 10:
                raise PolicyValidationError(f"decisions.{decision_id}.levels must contain 2 to 10 values")
            fallback = definition.get("fallback")
            if fallback is not None and (not isinstance(fallback, (int, float)) or isinstance(fallback, bool)):
                raise PolicyValidationError(f"decisions.{decision_id}.fallback must be numeric")
            decisions[decision_id] = ScoreDefinition("score", question, levels, confidence, fallback)
        elif kind == "noul":
            fallback = definition.get("fallback")
            if fallback is not None and not isinstance(fallback, bool):
                raise PolicyValidationError(f"decisions.{decision_id}.fallback must be boolean")
            decisions[decision_id] = NoulDefinition("noul", question, confidence, fallback)
        else:
            raise PolicyValidationError(f"decisions.{decision_id}.type must be choice, score, or noul")

    if not decisions:
        raise PolicyValidationError("policy.decisions must contain at least one decision")
    return Policy(
        version=1,
        decisions=decisions,
        name=root.get("name"),
        description=root.get("description"),
        model=root.get("model"),
        default_min_confidence=default_min or 0.0,
    )


def load_policy(path: str | Path) -> Policy:
    policy_path = Path(path)
    try:
        content = policy_path.read_text(encoding="utf-8")
        value = json.loads(content) if policy_path.suffix.lower() == ".json" else yaml.safe_load(content)
    except (OSError, json.JSONDecodeError, yaml.YAMLError) as error:
        raise PolicyValidationError(f"Could not parse {policy_path}: {error}") from error
    return parse_policy(value)
