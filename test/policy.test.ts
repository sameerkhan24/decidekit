import { describe, expect, it } from "vitest";
import { PolicyValidationError } from "../src/errors.js";
import { parsePolicy } from "../src/policy.js";

describe("parsePolicy", () => {
  it("accepts a valid policy", () => {
    const policy = parsePolicy({
      version: 1,
      decisions: {
        category: {
          type: "choice",
          question: "Which category?",
          choices: { a: "A", b: "B" },
          fallback: "b",
        },
      },
    });

    expect(policy.version).toBe(1);
    expect(policy.decisions.category?.type).toBe("choice");
  });

  it("rejects a fallback outside the allowed choices", () => {
    expect(() =>
      parsePolicy({
        version: 1,
        decisions: {
          category: {
            type: "choice",
            question: "Which category?",
            choices: { a: "A", b: "B" },
            fallback: "c",
          },
        },
      }),
    ).toThrow(PolicyValidationError);
  });

  it("rejects confidence values outside zero and one", () => {
    expect(() =>
      parsePolicy({
        version: 1,
        defaults: { minConfidence: 1.1 },
        decisions: {
          allowed: { type: "noul", question: "Allowed?" },
        },
      }),
    ).toThrow(/minConfidence/);
  });
});
