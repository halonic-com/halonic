import { readSignal, type Signal, signalRuleInfo } from "@halonicjs/format";
import { canonicalJson } from "@halonicjs/std";

/**
 * Which signal rules run, and how, from a workspace snapshot's `signals`
 * list (HAL-17980). A rule with no signal file runs with the settings that
 * keep today's behaviour. A signal the format refuses (an unknown rule, a
 * field it doesn't know such as an action, a key) turns its rule **off**:
 * it never runs with what the file asked for, and never falls back to more.
 * The rules the runtime runs are the ones with a pure rule in `rules/`.
 */

/** The rules this runtime has a pure rule for. */
export const runtimeRules = ["pr-watcher", "board-ask", "task-effort"] as const;

/** A rule this runtime runs. */
export type RuntimeRule = (typeof runtimeRules)[number];

/** How one rule runs this pass. */
export interface SignalPlan {
  readonly rule: RuntimeRule;
  /** The rule's settings, with every default filled in. */
  readonly settings: Signal["rule"]["with"];
  /** The file asked for a dry run. */
  readonly dryRun: boolean;
  /** Whether the rule's actions write. */
  readonly writes: boolean;
  /** `file` when a signal file set it up, `default` without one. */
  readonly source: "file" | "default";
  /** The signal in canonical JSON: a new or changed one runs a dry pass first. */
  readonly fingerprint: string;
}

/** Each rule's plan, or `off`, and a line for every signal turned off. */
export interface LoadedSignals {
  readonly plans: ReadonlyMap<RuntimeRule, SignalPlan | "off">;
  readonly lines: readonly string[];
}

function planOf(signal: Signal, source: SignalPlan["source"]): SignalPlan {
  return {
    rule: signal.rule.run,
    settings: signal.rule.with,
    dryRun: signal.dryRun,
    writes: signalRuleInfo(signal.rule.run).writes,
    source,
    fingerprint: source === "default" ? "default" : canonicalJson(signal),
  };
}

function defaultPlan(rule: RuntimeRule): SignalPlan {
  const read = readSignal({ version: 1, id: rule, rule: { run: rule } });
  if (!read.ok) {
    throw new Error(`The built-in signal ${rule} doesn't read: ${read.error[0]?.code}.`);
  }
  return planOf(read.value, "default");
}

/** The rule a refused entry names, when it names one this runtime runs. */
function namedRule(entry: unknown): RuntimeRule | undefined {
  const run = (entry as { rule?: { run?: unknown } } | null)?.rule?.run;
  return runtimeRules.find((rule) => rule === run);
}

/**
 * The plans from a snapshot's `signals` list: undefined when it has none.
 * Any list that isn't an array turns every rule off.
 *
 * @example
 * loadSignals(undefined).plans.get("pr-watcher"); // the default plan
 */
export function loadSignals(list: unknown): LoadedSignals {
  const plans = new Map<RuntimeRule, SignalPlan | "off">(
    runtimeRules.map((rule) => [rule, defaultPlan(rule)]),
  );
  if (list === undefined) {
    return { plans, lines: [] };
  }
  if (!Array.isArray(list)) {
    return {
      plans: new Map(runtimeRules.map((rule) => [rule, "off"])),
      lines: ["Signals: the snapshot's signals aren't a list, so every rule is off."],
    };
  }
  const lines: string[] = [];
  const seen = new Set<RuntimeRule>();
  list.forEach((entry: unknown, index) => {
    const read = readSignal(entry);
    const rule = read.ok ? read.value.rule.run : namedRule(entry);
    if (rule !== undefined && seen.has(rule)) {
      plans.set(rule, "off");
      lines.push(`Signals: signals[${index}] names ${rule} again, so ${rule} is off.`);
      return;
    }
    if (rule !== undefined) {
      seen.add(rule);
    }
    if (read.ok) {
      plans.set(read.value.rule.run, planOf(read.value, "file"));
      return;
    }
    const codes = read.error.map(({ code, path }) => `${code} at ${path.join(".")}`).join(", ");
    if (rule !== undefined) {
      plans.set(rule, "off");
    }
    lines.push(`Signals: signals[${index}] is refused (${codes}), so ${rule ?? "it"} is off.`);
  });
  return { plans, lines };
}
