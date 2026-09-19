import unittest

from decidekit import DecideKit, FixtureProvider, UncertainDecisionError, parse_policy


class DecideKitTests(unittest.TestCase):
    def setUp(self):
        self.policy = parse_policy(
            {
                "version": 1,
                "defaults": {"minConfidence": 0.8},
                "decisions": {
                    "route": {
                        "type": "choice",
                        "question": "Where should this go?",
                        "choices": {"billing": None, "manual": None},
                        "fallback": "manual",
                    },
                    "urgent": {
                        "type": "noul",
                        "question": "Is it urgent?",
                        "fallback": True,
                    },
                },
            }
        )

    def test_confident_decision(self):
        kit = DecideKit(
            self.policy,
            FixtureProvider(
                {
                    "route": {
                        "type": "choice",
                        "choice": "billing",
                        "probabilities": {"billing": 0.95, "manual": 0.05},
                        "confidence": 0.93,
                    }
                }
            ),
        )
        result = kit.decide("route", {"message": "charged twice"})
        self.assertEqual(result.value, "billing")
        self.assertTrue(result.certain)
        self.assertEqual(result.invocation_cost_usd, 0.0)

    def test_fallback(self):
        kit = DecideKit(
            self.policy,
            FixtureProvider(
                {
                    "route": {
                        "type": "choice",
                        "choice": "billing",
                        "probabilities": {"billing": 0.5, "manual": 0.5},
                        "confidence": 0.5,
                    }
                }
            ),
        )
        result = kit.decide("route", "ambiguous")
        self.assertEqual(result.raw_value, "billing")
        self.assertEqual(result.value, "manual")
        self.assertTrue(result.fallback_applied)

    def test_uncertainty_without_fallback(self):
        policy = parse_policy(
            {
                "version": 1,
                "decisions": {
                    "route": {
                        "type": "choice",
                        "question": "Where?",
                        "choices": {"a": None, "b": None},
                        "minConfidence": 0.9,
                    }
                },
            }
        )
        kit = DecideKit(
            policy,
            FixtureProvider(
                {"route": {"type": "choice", "choice": "a", "probabilities": {"a": 0.5, "b": 0.5}, "confidence": 0.5}}
            ),
        )
        with self.assertRaises(UncertainDecisionError):
            kit.decide("route", "ambiguous")


if __name__ == "__main__":
    unittest.main()
