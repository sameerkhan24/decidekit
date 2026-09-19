# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Report it privately through a
[GitHub Security Advisory](https://github.com/sameerkhan24/decidekit/security/advisories/new).

## Scope and expectations

DecideKit turns model judgments into typed results; it is not a security boundary. Applications must enforce
authorization, validation, rate limits, and irreversible-action safeguards with deterministic code. API keys are
read from the environment and should never be placed in a policy or fixture.
