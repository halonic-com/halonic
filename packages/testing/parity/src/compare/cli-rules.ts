import type { ComparedCall } from "./cli-output.ts";
import type { ComparedTest, LogEvent } from "./run-logs.ts";
import { type RunRule, runRules } from "./run-rules.ts";

/**
 * One way the CLI calls may differ, as code. An allowed difference names the
 * rules it allows in `cliRules`; the CLI compare applies the rules of every
 * entry, in the order of {@link cliRules}, before it compares. A rule only
 * takes out or changes what its `does` says, on the side it names.
 */
export interface CliRule {
  readonly id: string;
  /** What the rule takes out or changes, in plain words. */
  readonly does: string;
  readonly old?: (call: ComparedCall) => ComparedCall;
  readonly new?: (call: ComparedCall) => ComparedCall;
}

/** A run-log rule, applied to the runs a call stored as if they were one test's. */
function onRuns(change: (test: ComparedTest) => ComparedTest) {
  return (call: ComparedCall): ComparedCall => ({
    ...call,
    runs: change({ passed: true, failures: 0, runs: call.runs }).runs,
  });
}

function lifted(rule: RunRule): CliRule {
  return {
    id: rule.id,
    does: `${rule.does}, in the runs a call stored`,
    ...(rule.old === undefined ? {} : { old: onRuns(rule.old) }),
    ...(rule.new === undefined ? {} : { new: onRuns(rule.new) }),
  };
}

/** Changes every event of a call's runs by `change`. */
function eachEvent(call: ComparedCall, change: (event: LogEvent) => LogEvent): ComparedCall {
  return {
    ...call,
    runs: call.runs.map((run) => ({ ...run, events: run.events.map(change) })),
  };
}

/** Rewrites the `error` of every run.failed and workflow.finished by `words`. */
function errorsBy(words: (error: string) => string) {
  return (call: ComparedCall): ComparedCall =>
    eachEvent(call, (event) => {
      const failed = event["type"] === "run.failed" || event["type"] === "workflow.finished";
      const error = event["error"];
      return failed && typeof error === "string" ? { ...event, error: words(error) } : event;
    });
}

/** An agent's answer that isn't JSON, in the old words and the new ones, both as one plain form. */
const notJson = (error: string) =>
  error
    .replace(/Agent "([^"]+)" did not reply with valid JSON/g, 'Agent "$1" answered no JSON')
    .replace(
      /Agent "([^"]+)" answered .*?, which isn't the JSON its output asks for\. Tighten the agent's instructions or use a larger model\./g,
      'Agent "$1" answered no JSON',
    );

/** A foreach item whose child run failed, in the old words (counted from 1) and the new ones (from 0). */
const itemFailed = (error: string) =>
  error
    .replace(
      /^Item (\d+) of \d+: Workflow "([^"]+)" failed: /,
      (_, item: string, workflow: string) => `item ${Number(item) - 1}, workflow ${workflow}: `,
    )
    .replace(
      /^Workflow "([^"]+)" failed in item (\d+) of for-each state "[^"]+": /,
      (_, workflow: string, item: string) => `item ${item}, workflow ${workflow}: `,
    );

const withoutOutput = (call: ComparedCall): ComparedCall => ({ ...call, stdout: "", stderr: "" });

/** The new exit codes the old CLI gave as 1: 2 for a wrong command line or input, 4 to 9 for the error kinds. */
const foldedCodes = new Set([2, 4, 5, 6, 7, 8, 9]);

/** Every CLI rule, in the order the compare applies them: the CLI's own, then every run-log rule. */
export const cliRules: readonly CliRule[] = [
  {
    id: "output-words",
    does: "takes stdout and stderr out, on both sides",
    old: withoutOutput,
    new: withoutOutput,
  },
  {
    id: "exit-codes-by-kind",
    does: "turns the new exit codes 2 and 4 to 9 into 1, the old CLI's code for every failure; 3 stays",
    new: (call) => (foldedCodes.has(call.exitCode) ? { ...call, exitCode: 1 } : call),
  },
  {
    id: "test-runs-not-stored",
    does: "takes the runs out of the old test calls",
    old: (call) => (call.command === "test" ? { ...call, runs: [] } : call),
  },
  {
    id: "run-failed-reason",
    does: "takes reason out of the new run.failed",
    new: (call) =>
      eachEvent(call, (event) => {
        if (event["type"] !== "run.failed") return event;
        const { reason: _reason, ...rest } = event;
        return rest;
      }),
  },
  {
    id: "not-json-words",
    does: "gives an agent's answer that isn't JSON one plain form in run.failed and workflow.finished errors, on both sides",
    old: errorsBy(notJson),
    new: errorsBy(notJson),
  },
  {
    id: "item-failed-words",
    does: "gives a foreach item's failed child run one plain form at the start of a run.failed error, on both sides",
    old: errorsBy(itemFailed),
    new: errorsBy(itemFailed),
  },
  ...runRules.map(lifted),
];

/** The CLI rule with this id, or undefined. */
export function cliRule(id: string): CliRule | undefined {
  return cliRules.find((rule) => rule.id === id);
}
