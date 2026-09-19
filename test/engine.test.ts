import { describe, expect, it } from "vitest";
import { DecideKit } from "../src/engine.js";
import { UncertainDecisionError } from "../src/errors.js";
import { FixtureProvider } from "../src/providers/fixture.js";
import type { DecideKitPolicy, DecisionProvider, DecisionRequest } from "../src/types.js";

const policy: DecideKitPolicy = {
  version: 1,
  defaults: { minConfidence: 0.8 },
  decisions: {
    route: {
      type: "choice",
      question: "Where should this request go?",
      choices: { billing: null, engineering: null, manual: null },
      fallback: "manual",
    },
    urgent: {
      type: "noul",
      question: "Is this urgent?",
      minConfidence: 0.9,
      fallback: true,
    },
  },
};

describe("DecideKit", () => {
  it("returns a confident choice", async () => {
    const kit = new DecideKit({
      policy,
      provider: new FixtureProvider({
        answers: {
          route: {
            type: "choice",
            choice: "billing",
            probabilities: { billing: 0.95, engineering: 0.04, manual: 0.01 },
            confidence: 0.93,
          },
        },
      }),
    });

    const result = await kit.decide<string>("route", { message: "I was charged twice" });

    expect(result.value).toBe("billing");
    expect(result.certain).toBe(true);
    expect(result.fallbackApplied).toBe(false);
    expect(result.invocationCostUsd).toBe(0);
  });

  it("uses the configured fallback below the confidence threshold", async () => {
    const kit = new DecideKit({
      policy,
      provider: new FixtureProvider({
        answers: {
          route: {
            type: "choice",
            choice: "billing",
            probabilities: { billing: 0.45, engineering: 0.4, manual: 0.15 },
            confidence: 0.51,
          },
        },
      }),
    });

    const result = await kit.decide<string>("route", "ambiguous request");

    expect(result.rawValue).toBe("billing");
    expect(result.value).toBe("manual");
    expect(result.certain).toBe(false);
    expect(result.fallbackApplied).toBe(true);
  });

  it("derives Noul confidence from distance to 0.5", async () => {
    const kit = new DecideKit({
      policy,
      provider: new FixtureProvider({
        answers: { urgent: { type: "noul", noul: 0.55 } },
      }),
    });

    const result = await kit.decide<boolean>("urgent", "maybe someday");

    expect(result.confidence).toBe(0.55);
    expect(result.rawValue).toBe(true);
    expect(result.value).toBe(true);
    expect(result.fallbackApplied).toBe(true);
  });

  it("batches all questions in one provider request", async () => {
    const requests: DecisionRequest[] = [];
    const provider: DecisionProvider = {
      name: "spy",
      async evaluate(request) {
        requests.push(request);
        return {
          provider: "spy",
          model: "test",
          answers: {
            route: {
              type: "choice",
              choice: "engineering",
              probabilities: { billing: 0.01, engineering: 0.98, manual: 0.01 },
              confidence: 0.98,
            },
            urgent: { type: "noul", noul: 0.99 },
          },
        };
      },
    };
    const kit = new DecideKit({ policy, provider });

    const result = await kit.evaluate("all", "production is down");

    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0]?.questions ?? {})).toEqual(["route", "urgent"]);
    expect(Object.keys(result.decisions)).toEqual(["route", "urgent"]);
  });

  it("throws for uncertainty when no fallback exists", async () => {
    const noFallbackPolicy: DecideKitPolicy = {
      version: 1,
      decisions: {
        route: {
          type: "choice",
          question: "Route?",
          choices: { a: null, b: null },
          minConfidence: 0.9,
        },
      },
    };
    const kit = new DecideKit({
      policy: noFallbackPolicy,
      provider: new FixtureProvider({
        answers: {
          route: { type: "choice", choice: "a", probabilities: { a: 0.6, b: 0.4 }, confidence: 0.6 },
        },
      }),
    });

    await expect(kit.decide("route", "unclear")).rejects.toBeInstanceOf(UncertainDecisionError);
  });
});
