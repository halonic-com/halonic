import type { KindValues } from "@halonicjs/format";
import { encodeUtf8 } from "@halonicjs/std";

/**
 * At most this many bytes of code in one rule file (`workspace.rule-files`).
 * The isolate has no limit on the code it is given, so this one is ours: a
 * rule decides on data it is given, and 256 KB is far more than that needs.
 */
export const maxRuleFileBytes = 256 * 1024;

/**
 * One rule file a workflow names, as the loader read it: its text, or its
 * size when it is over {@link maxRuleFileBytes}, so a run never keeps it.
 */
export type RuleFile =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "too-large"; readonly bytes: number };

/** A workflow's rule steps: each state's name and the hub path its `rule` key names. */
export function ruleStepsOf(
  workflow: KindValues["workflow"],
): { readonly state: string; readonly rule: string }[] {
  const steps: { state: string; rule: string }[] = [];
  for (const [state, value] of Object.entries(workflow.states)) {
    if (value.rule !== undefined) steps.push({ state, rule: value.rule });
  }
  return steps;
}

/**
 * The workspace path of a rule file: its `rule` path is in the workflow's
 * hub (`null`: the workspace root). The format already refuses `..` and an
 * absolute path, so it never leaves that folder.
 *
 * @example
 * ruleFilePath("acme", "rules/match.rule.js"); // "hubs/acme/rules/match.rule.js"
 */
export function ruleFilePath(hub: string | null, rule: string): string {
  return hub === null ? rule : `hubs/${hub}/${rule}`;
}

/**
 * Reads the rule files the workflows name, by workspace path: those the
 * workspace lists, each once. A file over {@link maxRuleFileBytes} keeps
 * only its size. A missing one isn't among them: the check reports both.
 *
 * @param workflows - the workflows that parsed, with their hubs
 * @param listed - every path of the workspace
 * @param read - reads one file's text, `null` when it's gone
 */
export async function readRuleFiles(
  workflows: readonly { readonly hub: string | null; readonly value: KindValues["workflow"] }[],
  listed: ReadonlySet<string>,
  read: (path: string) => Promise<string | null>,
): Promise<Map<string, RuleFile>> {
  const paths = new Set<string>();
  for (const workflow of workflows) {
    for (const step of ruleStepsOf(workflow.value)) {
      const path = ruleFilePath(workflow.hub, step.rule);
      if (listed.has(path)) paths.add(path);
    }
  }
  const files = new Map<string, RuleFile>();
  for (const path of paths) {
    const text = await read(path);
    if (text !== null) files.set(path, ruleFileOf(text));
  }
  return files;
}

function ruleFileOf(text: string): RuleFile {
  const bytes = encodeUtf8(text).length;
  return bytes > maxRuleFileBytes ? { kind: "too-large", bytes } : { kind: "text", text };
}
