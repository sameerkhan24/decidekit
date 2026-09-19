#!/usr/bin/env node

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Command } from "commander";
import { DecideKit } from "./engine.js";
import { DecideKitError } from "./errors.js";
import { loadPolicy } from "./policy.js";
import { FixtureProvider, OpenRouterProvider, TypeSafeProvider } from "./providers/index.js";
import type { DecisionAnswer, DecisionProvider, JsonValue } from "./types.js";

const starterPolicy = `version: 1
name: pull-request-policy
description: Decide how a pull request should be handled.
model: typesafe/jev-1.13

defaults:
  minConfidence: 0.8

decisions:
  pull_request_action:
    type: choice
    question: What should happen to this pull request?
    choices:
      auto_merge: The change is routine, low risk, and adequately tested.
      human_review: The change needs human judgment or the evidence is incomplete.
      block: The change presents a likely security, data-loss, or breaking-change risk.
    fallback: human_review

  security_sensitive:
    type: noul
    question: Does this change affect authentication, authorization, secrets, or sensitive data?
    minConfidence: 0.85
    fallback: true
`;

interface RunOptions {
  all?: boolean;
  state: string;
  provider: string;
  fixture?: string;
  model?: string;
  inputCostPerMillion?: string;
  outputCostPerMillion?: string;
  record?: string;
  compact?: boolean;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function parseState(value: string): Promise<JsonValue> {
  let contents = value;
  if (value === "-") contents = await readStdin();
  else if (value.startsWith("@")) contents = await readFile(resolve(value.slice(1)), "utf8");
  try {
    return JSON.parse(contents) as JsonValue;
  } catch {
    return contents;
  }
}

async function createProvider(options: RunOptions): Promise<DecisionProvider> {
  const inputCostPerMillion =
    options.inputCostPerMillion === undefined ? undefined : Number(options.inputCostPerMillion);
  const outputCostPerMillion =
    options.outputCostPerMillion === undefined ? undefined : Number(options.outputCostPerMillion);
  for (const [name, value] of Object.entries({ inputCostPerMillion, outputCostPerMillion })) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new DecideKitError(
        `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be a non-negative number.`,
      );
    }
  }
  const pricing = {
    ...(inputCostPerMillion === undefined ? {} : { inputCostPerMillion }),
    ...(outputCostPerMillion === undefined ? {} : { outputCostPerMillion }),
  };
  switch (options.provider) {
    case "openrouter":
      return new OpenRouterProvider({ ...(options.model ? { model: options.model } : {}), ...pricing });
    case "typesafe":
      return new TypeSafeProvider({ ...(options.model ? { model: options.model } : {}), ...pricing });
    case "fixture": {
      if (!options.fixture) throw new DecideKitError("--fixture <path> is required with --provider fixture.");
      const parsed = JSON.parse(await readFile(resolve(options.fixture), "utf8")) as {
        answers?: Record<string, DecisionAnswer>;
      };
      if (!parsed.answers) throw new DecideKitError("Fixture JSON must contain an answers object.");
      return new FixtureProvider({ answers: parsed.answers });
    }
    default:
      throw new DecideKitError(
        `Unknown provider "${options.provider}". Use openrouter, typesafe, or fixture.`,
      );
  }
}

async function runPolicy(
  policyPath: string,
  decisionId: string | undefined,
  options: RunOptions,
): Promise<void> {
  const policy = await loadPolicy(resolve(policyPath));
  const state = await parseState(options.state);
  const provider = await createProvider(options);
  const kit = new DecideKit({
    policy,
    provider,
    ...(options.model ? { model: options.model } : {}),
  });
  const ids = options.all ? "all" : decisionId ? [decisionId] : "all";
  const result = await kit.evaluate(ids, state);
  const output = JSON.stringify(result, null, options.compact ? 0 : 2);
  process.stdout.write(`${output}\n`);
  if (options.record) {
    const record = { recordedAt: new Date().toISOString(), state, result };
    await appendFile(resolve(options.record), `${JSON.stringify(record)}\n`, "utf8");
  }
}

const program = new Command()
  .name("decidekit")
  .description("Typed, confidence-aware decisions for software.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a documented starter policy")
  .argument("[path]", "output path", "decidekit.yml")
  .option("--force", "overwrite an existing file", false)
  .action(async (path: string, options: { force: boolean }) => {
    const target = resolve(path);
    await writeFile(target, starterPolicy, { encoding: "utf8", flag: options.force ? "w" : "wx" });
    process.stdout.write(`Created ${target}\n`);
  });

program
  .command("validate")
  .description("Validate a policy without calling a provider")
  .argument("<policy>", "YAML or JSON policy path")
  .action(async (path: string) => {
    const policy = await loadPolicy(resolve(path));
    process.stdout.write(
      `Valid policy: ${policy.name ?? path} (${Object.keys(policy.decisions).length} decisions)\n`,
    );
  });

program
  .command("run")
  .description("Evaluate one or all decisions")
  .argument("<policy>", "YAML or JSON policy path")
  .argument("[decision]", "decision id; omitted means all")
  .requiredOption("--state <json|@file|->", "JSON, plain text, @file, or - for stdin")
  .option("--all", "evaluate every decision", false)
  .option("--provider <name>", "openrouter, typesafe, or fixture", "openrouter")
  .option("--fixture <path>", "fixture JSON for offline evaluation")
  .option("--model <id>", "override the model")
  .option("--input-cost-per-million <usd>", "override input price in USD per million tokens")
  .option("--output-cost-per-million <usd>", "override output price in USD per million tokens")
  .option("--record <path>", "append a JSONL decision trace")
  .option("--compact", "emit compact JSON", false)
  .action(runPolicy);

program
  .command("print")
  .description("Parse a policy and print its normalized JSON")
  .argument("<policy>")
  .action(async (path: string) => {
    const policy = await loadPolicy(resolve(path));
    process.stdout.write(`${JSON.stringify(policy, null, 2)}\n`);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`decidekit: ${message}\n`);
  process.exitCode = 1;
});
