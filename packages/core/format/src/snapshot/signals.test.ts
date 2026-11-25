import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { Signal } from "../kinds/signal/schema.ts";
import { readSignal } from "./signals.ts";
import { makeSnapshot, readSnapshot, type SnapshotProblem, snapshotText } from "./snapshot.ts";

const commit = "0123456789abcdef0123456789abcdef01234567";

/** An invented key in a format `findSecretShape` knows, all lowercase so it fits an id; never a real one. */
const lowercaseKey = `sk-${"q7x2lm9k".repeat(4)}`;

/** A parsed PR watcher signal with this id. */
function signal(id: string): Signal {
  return {
    version: 1,
    id,
    rule: { run: "pr-watcher", with: { done: true, wakeOn: ["ci-red"] } },
    dryRun: false,
  };
}

/** Each problem as "path code". */
function summary(problems: readonly SnapshotProblem[]): string[] {
  return problems.map((problem) => `${problem.path.join(".")} ${problem.code}`);
}

/** The problems of a snapshot with these signals, failing the test when it passes. */
function problemsOf(signals: unknown[]): string[] {
  const read = readSnapshot({ format: 1, workspace: { name: "Acme", commit }, tools: [], signals });
  if (read.ok) {
    expect.fail("expected the snapshot to be refused");
  }
  return summary(read.error);
}

verifies("format.workspace-snapshot", () => {
  it("keeps the signals, and leaves the list out when there are none", () => {
    const made = makeSnapshot({ name: "Acme", commit, tools: [], signals: [signal("watcher")] });
    if (!made.ok) {
      expect.fail(JSON.stringify(made.error));
    }
    expect(made.value.signals).toEqual([signal("watcher")]);
    expect(readSnapshot(JSON.parse(snapshotText(made.value)))).toEqual(made);
    const none = makeSnapshot({ name: "Acme", commit, tools: [] });
    expect(none.ok && Object.keys(none.value)).toEqual(["format", "workspace", "tools"]);
  });

  it("refuses a signal's id or rule used twice, signals out of id order, and a signal's own refusals", () => {
    expect(problemsOf([signal("a"), signal("a")])).toEqual([
      "signals.1.id signal-id-twice",
      "signals.1.rule.run signal-rule-twice",
    ]);
    expect(problemsOf([signal("b"), signal("a")])).toEqual([
      "signals.1.rule.run signal-rule-twice",
      "signals.1 signals-not-sorted",
    ]);
    expect(problemsOf([signal(lowercaseKey)])).toEqual(["signals.0.id value-looks-like-key"]);
    const unknown = { ...signal("a"), rule: { run: "shell.run", with: {} } };
    expect(problemsOf([unknown])).toEqual(["signals.0.rule.run invalid_union"]);
    const action = { ...signal("a"), action: { run: "paperclip.task" } };
    expect(problemsOf([action])).toEqual(["signals.0 unrecognized_keys"]);
  });

  it("reads one signal on its own, with its defaults and its refusals", () => {
    const read = readSignal({ version: 1, id: "watcher", rule: { run: "pr-watcher" } });
    expect(read.ok ? read.value : undefined).toMatchObject({
      rule: { run: "pr-watcher", with: { done: true } },
      dryRun: false,
    });
    const leaky = readSignal(signal(lowercaseKey));
    expect(leaky.ok ? [] : summary(leaky.error)).toEqual(["id value-looks-like-key"]);
    expect(leaky.ok ? "" : JSON.stringify(leaky.error)).not.toContain(lowercaseKey);
    const unknown = readSignal({ ...signal("a"), rule: { run: "deploy" } });
    expect(unknown.ok ? [] : summary(unknown.error)).toEqual(["rule.run invalid_union"]);
  });
});
