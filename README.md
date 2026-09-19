# DecideKit

**Typed, confidence-aware AI decisions for software.**

DecideKit turns fuzzy real-world judgment into a small interface ordinary code can safely branch on. Define
decisions in YAML or TypeScript, evaluate them with Jev through OpenRouter or TypeSafe, and choose an explicit
fallback whenever the model is uncertain.

```text
application state + typed questions
                 ↓
              DecideKit
                 ↓
   value + probability + confidence + trace
```

DecideKit is not an agent framework and does not generate prose. It is a decision layer for routing, scoring,
gating, classification, and other places where a brittle `if` statement is not enough.

## Why

- **Bounded outputs:** code receives a declared choice, score, or boolean probability.
- **Uncertainty is a branch:** low-confidence answers fall back or fail closed.
- **One request, many judgments:** independent decisions are batched against the same state.
- **Provider-neutral:** use OpenRouter today and change providers without rewriting policy code.
- **Testable offline:** deterministic fixtures keep unit tests fast and free.
- **Observable:** results include raw values, applied fallbacks, confidence, latency, model, and token usage.

## Quick start

Requires Node.js 20 or newer.

```bash
npm install
npm run build
node dist/cli.js validate examples/pull-request.yml
```

The commands above run directly from a checkout. After the first release, JavaScript consumers can install the
package with `npm install decidekit`, and Python consumers can install it with `pip install decidekit`.

Try the complete pull-request policy without an API key:

```bash
node dist/cli.js run examples/pull-request.yml \
  --all \
  --state @examples/pull-request-state.json \
  --provider fixture \
  --fixture examples/pull-request-fixture.json
```

The `examples/` directory also includes live-ready policies for support routing, agent-action authorization, and
webhook workflow selection.

Each of those policies has a matching `*-fixture.json`, so the same examples can be run offline from either
JavaScript or Python.

Run it with Jev on OpenRouter:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...

node dist/cli.js run examples/pull-request.yml \
  --all \
  --state @examples/pull-request-state.json
```

OpenRouter calls use its native Decisions API rather than chat completions. The default model is
`typesafe/jev-1.13`.

## Policy format

```yaml
version: 1
name: support-router
model: typesafe/jev-1.13

defaults:
  minConfidence: 0.8

decisions:
  destination:
    type: choice
    question: Which team should handle this request?
    choices:
      billing: Charges, invoices, refunds, or subscriptions.
      engineering: Bugs, errors, integrations, or technical problems.
      general: Questions that do not fit another team.
    fallback: general

  urgent:
    type: noul
    question: Does this request require immediate attention?
    minConfidence: 0.9
    fallback: true

  sentiment:
    type: score
    question: How frustrated does the customer appear?
    levels:
      - Calm
      - Concerned
      - Frustrated
      - Extremely upset
    fallback: 3
```

Three decision types map to Jev's native primitives:

| Policy type | Output | Confidence behavior |
| --- | --- | --- |
| `choice` | One declared choice | Uses provider confidence |
| `score` | Probability-weighted numeric position | Uses provider confidence |
| `noul` | `true` or `false` | Uses `max(p, 1-p)` |

When confidence is below `minConfidence`, DecideKit returns the declared `fallback`. If no fallback exists, it
throws `UncertainDecisionError`; an uncertain result is never silently treated as certain.

## Library API

```ts
import { DecideKit, OpenRouterProvider, loadPolicy } from "decidekit";

const policy = await loadPolicy("./decidekit.yml");
const decisions = new DecideKit({
  policy,
  provider: new OpenRouterProvider(),
});

const result = await decisions.decide<string>("destination", {
  message: "I was charged twice. Please refund the duplicate payment.",
  plan: "business",
});

console.log(result.value);           // billing
console.log(result.confidence);      // provider confidence
console.log(result.fallbackApplied); // false
```

Batch decisions to evaluate them together:

```ts
const result = await decisions.evaluate(
  ["destination", "urgent", "sentiment"],
  { message: incomingTicket },
);
```

## Python

The same policy format and provider contract are available as a Python package for Python 3.10+:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .

export OPENROUTER_API_KEY=sk-or-v1-...
decidekit run examples/support-routing.yml \
  --all \
  --state @examples/support-routing-state.json
```

The Python API mirrors the JavaScript API:

```python
from decidekit import DecideKit, OpenRouterProvider, load_policy

policy = load_policy("examples/support-routing.yml")
decisions = DecideKit(policy, OpenRouterProvider())
result = decisions.decide(
    "team",
    {"message": "Our webhook integration is returning 401s."},
)

print(result.value)
print(result.confidence)
print(result.fallback_applied)
```

## Invocation cost

Every provider invocation reports token usage and `costUsd`. For a batched evaluation, this is the total cost of
the single provider call—not the cost repeated once per decision:

```json
{
  "provider": "openrouter",
  "usage": {
    "inputTokens": 512,
    "outputTokens": 76,
    "costUsd": 0.000021504
  },
  "costUsd": 0.000021504
}
```

OpenRouter and TypeSafe providers default to Jev's published `$0.042 / 1M` input-token price and `$0 / 1M`
output-token price. If a provider returns an authoritative cost, DecideKit uses that value. Override pricing when
your account, model, or gateway has different rates:

```ts
new OpenRouterProvider({
  inputCostPerMillion: 0.05,
  outputCostPerMillion: 0.20,
});
```

The Python providers expose the equivalent `input_cost_per_million` and `output_cost_per_million` arguments.
Fixture calls report `costUsd: 0`.

Python also supports the offline fixtures:

```bash
decidekit run examples/agent-action.yml \
  --all \
  --state @examples/agent-action-state.json \
  --provider fixture \
  --fixture examples/agent-action-fixture.json
```

## Offline tests

```ts
import { DecideKit, FixtureProvider, parsePolicy } from "decidekit";

const policy = parsePolicy({
  version: 1,
  decisions: {
    action: {
      type: "choice",
      question: "What should happen?",
      choices: { allow: null, review: null },
      minConfidence: 0.9,
      fallback: "review",
    },
  },
});

const kit = new DecideKit({
  policy,
  provider: new FixtureProvider({
    answers: {
      action: {
        type: "choice",
        choice: "allow",
        probabilities: { allow: 0.6, review: 0.4 },
        confidence: 0.55,
      },
    },
  }),
});

const result = await kit.decide("action", { request: "..." });
// result.rawValue === "allow"
// result.value === "review"
// result.fallbackApplied === true
```

## CLI

After installing the package, the CLI is available as `decidekit`. From a repository checkout, use
`node dist/cli.js` in the commands below after running `npm run build`.

```text
decidekit init [path]                         Create a starter policy
decidekit validate <policy>                   Validate without calling a model
decidekit print <policy>                      Print normalized JSON
decidekit run <policy> [decision] [options]   Evaluate decisions
```

`run` accepts JSON, plain text, a file, or stdin:

```bash
node dist/cli.js run policy.yml route --state '{"message":"refund please"}'
node dist/cli.js run policy.yml --all --state @event.json
cat event.json | node dist/cli.js run policy.yml --all --state -
```

Add `--record decisions.jsonl` to append complete decision traces for later evaluation. Secrets are never read
from policy files; providers use `OPENROUTER_API_KEY` or `TYPESAFE_API_KEY`.

## Providers

### OpenRouter

```ts
new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "typesafe/jev-1.13",
  appName: "My app",
  appUrl: "https://github.com/me/my-app",
});
```

### TypeSafe

```ts
new TypeSafeProvider({
  apiKey: process.env.TYPESAFE_API_KEY,
  model: "jev-latest",
});
```

### Custom provider

Implement one method:

```ts
import type { DecisionProvider } from "decidekit";

const provider: DecisionProvider = {
  name: "internal",
  async evaluate(request) {
    return {
      provider: "internal",
      model: "classifier-v1",
      answers: {}, // one typed answer for each request.questions key
    };
  },
};
```

## Safety model

Model confidence is evidence, not a guarantee. For destructive, financial, security-sensitive, or irreversible
actions:

1. Use conservative thresholds and fail-closed fallbacks.
2. Validate permissions and invariants with deterministic code.
3. Keep a human approval step where mistakes have material consequences.
4. Evaluate policies against representative labeled data before automating them.
5. Record the model version and decision trace.

## Development

```bash
npm install
npm run check
npm run build

# Python (after `pip install -e .`)
npm run test:python
```

The project is MIT licensed. Contributions and provider adapters are welcome.
