# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the repository owner privately through the
security-reporting channel configured on the eventual GitHub repository.

Until that channel is configured, do not publish DecideKit for production use with untrusted inputs.

## Scope and expectations

DecideKit turns model judgments into typed results; it is not a security boundary. Applications must enforce
authorization, validation, rate limits, and irreversible-action safeguards with deterministic code. API keys are
read from the environment and should never be placed in a policy or fixture.
