import json
import unittest

from decidekit import OpenRouterProvider
from decidekit.types import DecisionQuestion


class FakeResponse:
    def __init__(self, body):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class OpenRouterTests(unittest.TestCase):
    def test_decisions_contract(self):
        captured = {}

        def transport(request, timeout):
            captured["url"] = request.full_url
            captured["body"] = json.loads(request.data.decode())
            captured["auth"] = request.get_header("Authorization")
            return FakeResponse(
                json.dumps(
                    {
                        "model": "typesafe/jev-1.13-20260917",
                        "answers": {
                            "route": {
                                "type": "choice",
                                "choice": "billing",
                                "probabilities": {"billing": 0.98, "other": 0.02},
                                "confidence": 0.97,
                            }
                        },
                        "usage": {"input_tokens": 42, "output_tokens": 0},
                    }
                ).encode()
            )

        provider = OpenRouterProvider(api_key="sk-or-test", transport=transport, max_retries=0)
        response = provider.evaluate(
            {"message": "charged twice"},
            {
                "route": DecisionQuestion("choice", "Where should this go?", {"billing": None, "other": None}),
            },
        )
        self.assertEqual(captured["url"], "https://openrouter.ai/api/alpha/decisions")
        self.assertEqual(captured["body"]["model"], "typesafe/jev-1.13")
        self.assertEqual(captured["auth"], "Bearer sk-or-test")
        self.assertEqual(response.model, "typesafe/jev-1.13-20260917")
        self.assertAlmostEqual(response.usage.cost_usd, 0.000001764, places=12)


if __name__ == "__main__":
    unittest.main()
