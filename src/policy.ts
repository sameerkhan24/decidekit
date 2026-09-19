import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { PolicyValidationError } from "./errors.js";
import type { DecideKitPolicy, JsonValue } from "./types.js";

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const confidenceSchema = z.number().min(0).max(1);

const choiceSchema = z
  .object({
    type: z.literal("choice"),
    question: z.string().min(1),
    choices: z
      .record(z.string().min(1), jsonValueSchema)
      .refine((choices) => Object.keys(choices).length >= 2, {
        message: "A choice decision needs at least two choices",
      }),
    minConfidence: confidenceSchema.optional(),
    fallback: z.string().min(1).optional(),
  })
  .superRefine((definition, context) => {
    if (definition.fallback && !(definition.fallback in definition.choices)) {
      context.addIssue({
        code: "custom",
        path: ["fallback"],
        message: `Fallback must be one of: ${Object.keys(definition.choices).join(", ")}`,
      });
    }
  });

const scoreSchema = z.object({
  type: z.literal("score"),
  question: z.string().min(1),
  levels: z.array(jsonValueSchema).min(2).max(10),
  minConfidence: confidenceSchema.optional(),
  fallback: z.number().optional(),
});

const noulSchema = z.object({
  type: z.literal("noul"),
  question: z.string().min(1),
  minConfidence: confidenceSchema.optional(),
  fallback: z.boolean().optional(),
});

export const policySchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  defaults: z
    .object({
      minConfidence: confidenceSchema.optional(),
    })
    .optional(),
  decisions: z.record(
    z.string().min(1),
    z.discriminatedUnion("type", [choiceSchema, scoreSchema, noulSchema]),
  ),
});

export function parsePolicy(input: unknown): DecideKitPolicy {
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "policy"}: ${issue.message}`)
      .join("\n");
    throw new PolicyValidationError(`Invalid DecideKit policy:\n${details}`);
  }
  return parsed.data as DecideKitPolicy;
}

export async function loadPolicy(path: string): Promise<DecideKitPolicy> {
  const contents = await readFile(path, "utf8");
  let input: unknown;
  try {
    input = extname(path).toLowerCase() === ".json" ? JSON.parse(contents) : YAML.parse(contents);
  } catch (error) {
    throw new PolicyValidationError(
      `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return parsePolicy(input);
}
