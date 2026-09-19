# Contributing to DecideKit

Thank you for helping make AI decisions easier to test and safer to use.

## Development

1. Use Node.js 20 or newer.
2. Run `npm install`.
3. Make a focused change with tests.
4. Run `npm run check && npm run build` before opening a pull request.

For Python changes, run `PYTHONPATH=python python -m unittest discover -s python/tests -v` and install the project
with `python -m pip install -e .` first.

Provider adapters must preserve DecideKit's native `state + questions → answers` contract. New behavior should be
testable without a live API key. Never commit credentials or customer data.

## Pull requests

- Explain the problem and the behavior change.
- Add or update tests for observable behavior.
- Keep public APIs typed and provider-neutral where practical.
- Document new configuration and environment variables.
- Call out compatibility or security implications.

Live-provider tests belong in a separate opt-in suite so normal contributors and CI do not incur API charges.
