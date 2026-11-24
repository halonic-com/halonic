import { maxAgentCalls } from "./header-parts.ts";
import type { InputField } from "./input-fields.ts";
import { collectTexts, findPlaceholders, hasStrayBrace } from "./placeholders.ts";

/** The parts of a header whose cross-references this file checks. */
export interface HeaderFields {
  audience: "user" | "agent";
  inputs: Readonly<Record<string, InputField>>;
  uses: readonly string[];
  touches?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
  steps?: readonly unknown[] | undefined;
  guide?: { perStep?: Readonly<Record<string, string>> | undefined } | undefined;
  ui?: { form?: { fields: readonly { input: string }[] } | undefined } | undefined;
  examples?:
    | readonly {
        input: Readonly<Record<string, unknown>>;
        calls: readonly { capability: string }[];
      }[]
    | undefined;
  limits?: { calls?: number | undefined } | undefined;
  tool?: unknown;
}

/** One problem found by the cross-checks, with where it is in the header. */
export interface ReferenceProblem {
  path: (string | number)[];
  message: string;
}

/** Why a `{input.…}` placeholder in a text is wrong, or undefined when it is fine. */
function placeholderProblem(
  text: string,
  inputs: HeaderFields["inputs"],
  mode: "touches" | "text",
): string | undefined {
  if (mode === "touches" && hasStrayBrace(text)) {
    return "only {input.name} placeholders are allowed in a template";
  }
  for (const { name, each } of findPlaceholders(text)) {
    const field = inputs[name];
    if (field === undefined) return `{input.${name}} names no input`;
    if (field.type === "string" && field.secret === true) {
      return `{input.${name}} is a secret input, which header text can't show`;
    }
    if (each && field.type !== "list") return `{input.${name}[]} needs a list input`;
    if (mode === "touches" && !each && field.type === "list") {
      return `{input.${name}} is a list: write {input.${name}[]}`;
    }
  }
  return undefined;
}

function audienceProblems(header: HeaderFields): ReferenceProblem[] {
  const problems: ReferenceProblem[] = [];
  if (header.audience === "user") {
    if (header.tool !== undefined) {
      problems.push({ path: ["tool"], message: "tool is for an agent ToolScript only" });
    }
    return problems;
  }
  for (const [name, field] of Object.entries(header.inputs)) {
    if (field.type === "string" && field.secret === true) {
      problems.push({
        path: ["inputs", name, "secret"],
        message: "an agent ToolScript can't take a secret input",
      });
    }
  }
  if (header.tool === undefined) {
    problems.push({
      path: ["tool"],
      message: "an agent ToolScript needs a tool name and description",
    });
  }
  if (header.touches !== undefined) {
    problems.push({ path: ["touches"], message: "touches are for a user ToolScript only" });
  }
  if (header.steps !== undefined) {
    problems.push({ path: ["steps"], message: "steps are for a user ToolScript only" });
  }
  const calls = header.limits?.calls;
  if (calls !== undefined && calls > maxAgentCalls) {
    problems.push({
      path: ["limits", "calls"],
      message: `an agent tool may make at most ${maxAgentCalls} calls`,
    });
  }
  return problems;
}

function touchesProblems(header: HeaderFields): ReferenceProblem[] {
  const problems: ReferenceProblem[] = [];
  for (const [capability, targets] of Object.entries(header.touches ?? {})) {
    if (!header.uses.includes(capability)) {
      problems.push({ path: ["touches", capability], message: `${capability} is not in uses` });
    }
    for (const [target, template] of Object.entries(targets)) {
      const message = placeholderProblem(template, header.inputs, "touches");
      if (message !== undefined) {
        problems.push({ path: ["touches", capability, target], message });
      }
    }
  }
  return problems;
}

function textProblems(header: HeaderFields): ReferenceProblem[] {
  const problems: ReferenceProblem[] = [];
  const sections = { steps: header.steps, ui: header.ui, guide: header.guide } as const;
  for (const [section, value] of Object.entries(sections)) {
    for (const text of collectTexts(value)) {
      const message = placeholderProblem(text, header.inputs, "text");
      if (message !== undefined) problems.push({ path: [section], message });
    }
  }
  return problems;
}

function nameProblems(header: HeaderFields): ReferenceProblem[] {
  const problems: ReferenceProblem[] = [];
  for (const [index, field] of (header.ui?.form?.fields ?? []).entries()) {
    if (header.inputs[field.input] === undefined) {
      problems.push({
        path: ["ui", "form", "fields", index, "input"],
        message: `${field.input} is not an input`,
      });
    }
  }
  for (const key of Object.keys(header.guide?.perStep ?? {})) {
    const isBlock = /^\d+$/.test(key) && Number(key) < (header.steps?.length ?? 0);
    if (!header.uses.includes(key) && !isBlock) {
      problems.push({
        path: ["guide", "perStep", key],
        message: `${key} is neither in uses nor a step index`,
      });
    }
  }
  return problems;
}

function exampleProblems(header: HeaderFields): ReferenceProblem[] {
  const problems: ReferenceProblem[] = [];
  for (const [index, example] of (header.examples ?? []).entries()) {
    for (const name of Object.keys(example.input)) {
      if (header.inputs[name] === undefined) {
        problems.push({
          path: ["examples", index, "input", name],
          message: `${name} is not an input`,
        });
      }
    }
    for (const call of example.calls) {
      if (!header.uses.includes(call.capability)) {
        problems.push({
          path: ["examples", index, "calls"],
          message: `${call.capability} is not in uses`,
        });
      }
    }
  }
  return problems;
}

/**
 * The checks that need only the header itself: audience rules, and that
 * `touches`, `steps`, `ui`, `guide` and `examples` refer only to its own
 * inputs and `uses`.
 */
export function checkHeaderReferences(header: HeaderFields): ReferenceProblem[] {
  return [
    ...audienceProblems(header),
    ...touchesProblems(header),
    ...textProblems(header),
    ...nameProblems(header),
    ...exampleProblems(header),
  ];
}
