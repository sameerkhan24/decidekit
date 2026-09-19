import { describe, expect, it, vi } from "vitest";
import { OpenRouterProvider } from "../src/providers/openrouter.js";

describe("OpenRouterProvider", () => {
  it("calls the Decisions endpoint with a normalized Jev request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          answers: {
            route: {
              type: "choice",
              choice: "billing",
              probabilities: { billing: 0.97, other: 0.03 },
              confidence: 0.96,
            },
          },
          usage: { input_tokens: 42, output_tokens: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-test",
      model: "jev-latest",
      fetch: fetchMock,
      maxRetries: 0,
    });

    const result = await provider.evaluate({
      state: { message: "charged twice" },
      questions: {
        route: {
          type: "choice",
          instructions: "Where should this go?",
          criteria: { billing: null, other: null },
        },
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://openrouter.ai/api/alpha/decisions");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-or-test");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: "typesafe/jev-1.13",
      state: { message: "charged twice" },
    });
    expect(result.usage).toMatchObject({ inputTokens: 42, outputTokens: 0 });
    expect(result.usage?.costUsd).toBeCloseTo(0.000001764, 12);
  });
});
