from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .engine import DecideKit
from .errors import DecideKitError
from .policy import load_policy
from .providers import FixtureProvider, OpenRouterProvider, TypeSafeProvider

STARTER_POLICY = """version: 1
name: support-router
model: typesafe/jev-1.13

defaults:
  minConfidence: 0.8

decisions:
  team:
    type: choice
    question: Which team should handle this request?
    choices:
      billing: Charges, invoices, refunds, or subscriptions.
      engineering: Bugs, errors, integrations, or technical failures.
      general: Questions that do not fit another team.
    fallback: general

  urgent:
    type: noul
    question: Does this request require immediate attention?
    minConfidence: 0.9
    fallback: true
"""


def _state(value: str) -> Any:
    if value == "-":
        contents = sys.stdin.read()
    elif value.startswith("@"):
        contents = Path(value[1:]).read_text(encoding="utf-8")
    else:
        contents = value
    try:
        return json.loads(contents)
    except json.JSONDecodeError:
        return contents


def _provider(args: argparse.Namespace):
    for name in ("input_cost_per_million", "output_cost_per_million"):
        value = getattr(args, name, None)
        if value is not None and value < 0:
            raise DecideKitError(f"--{name.replace('_', '-')} must be a non-negative number")
    if args.provider == "openrouter":
        return OpenRouterProvider(
            model=args.model or "typesafe/jev-1.13",
            **({"input_cost_per_million": args.input_cost_per_million} if args.input_cost_per_million is not None else {}),
            **({"output_cost_per_million": args.output_cost_per_million} if args.output_cost_per_million is not None else {}),
        )
    if args.provider == "typesafe":
        return TypeSafeProvider(
            model=args.model or "jev-latest",
            **({"input_cost_per_million": args.input_cost_per_million} if args.input_cost_per_million is not None else {}),
            **({"output_cost_per_million": args.output_cost_per_million} if args.output_cost_per_million is not None else {}),
        )
    if args.provider == "fixture":
        if not args.fixture:
            raise DecideKitError("--fixture is required with --provider fixture")
        fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
        if not isinstance(fixture, dict) or not isinstance(fixture.get("answers"), dict):
            raise DecideKitError("Fixture JSON must contain an answers object")
        return FixtureProvider(fixture["answers"], model=args.model or "fixture-v1")
    raise DecideKitError(f'Unknown provider "{args.provider}"')


def _jsonable(value: Any) -> Any:
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


def _run(args: argparse.Namespace) -> int:
    policy = load_policy(args.policy)
    state = _state(args.state)
    result = DecideKit(policy, _provider(args), model=args.model).evaluate(
        "all" if args.all or args.decision is None else [args.decision],
        state,
    )
    output = _jsonable(result)
    print(json.dumps(output, indent=None if args.compact else 2))
    if args.record:
        trace = {"recordedAt": datetime.now(timezone.utc).isoformat(), "state": state, "result": output}
        with Path(args.record).open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(trace) + "\n")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="decidekit", description="Typed, confidence-aware AI decisions.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init", help="create a starter policy")
    init.add_argument("path", nargs="?", default="decidekit.yml")
    init.add_argument("--force", action="store_true")

    validate = subparsers.add_parser("validate", help="validate a policy without calling a provider")
    validate.add_argument("policy")

    print_policy = subparsers.add_parser("print", help="print normalized policy JSON")
    print_policy.add_argument("policy")

    run = subparsers.add_parser("run", help="evaluate one or all decisions")
    run.add_argument("policy")
    run.add_argument("decision", nargs="?")
    run.add_argument("--state", required=True, help="JSON, plain text, @file, or - for stdin")
    run.add_argument("--all", action="store_true")
    run.add_argument("--provider", choices=["openrouter", "typesafe", "fixture"], default="openrouter")
    run.add_argument("--fixture")
    run.add_argument("--model")
    run.add_argument("--input-cost-per-million", type=float)
    run.add_argument("--output-cost-per-million", type=float)
    run.add_argument("--record")
    run.add_argument("--compact", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "init":
            path = Path(args.path)
            if path.exists() and not args.force:
                raise DecideKitError(f"Refusing to overwrite {path}; pass --force to replace it")
            path.write_text(STARTER_POLICY, encoding="utf-8")
            print(f"Created {path}")
            return 0
        if args.command == "validate":
            policy = load_policy(args.policy)
            print(f"Valid policy: {policy.name or args.policy} ({len(policy.decisions)} decisions)")
            return 0
        if args.command == "print":
            policy = load_policy(args.policy)
            print(json.dumps(_jsonable(policy), indent=2, default=lambda value: value.__dict__))
            return 0
        if args.command == "run":
            return _run(args)
        parser.error("unknown command")
    except DecideKitError as error:
        print(f"decidekit: {error}", file=sys.stderr)
        return 1
    except (OSError, ValueError) as error:
        print(f"decidekit: {error}", file=sys.stderr)
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
