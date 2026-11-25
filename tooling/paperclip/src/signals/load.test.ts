import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { loadSignals } from "./load.ts";

const watcher = { version: 1, id: "watcher", rule: { run: "pr-watcher" } };

verifies("paperclip.signals", () => {
  test("runs every rule with today's behaviour when the snapshot has no signals", () => {
    const { plans, lines } = loadSignals(undefined);
    expect(plans.get("pr-watcher")).toMatchObject({
      source: "default",
      dryRun: false,
      writes: true,
      settings: {
        done: true,
        wakeOn: ["ci-red", "conflict", "retargeted", "review", "approved", "merged", "held"],
      },
    });
    expect(lines).toEqual([]);
  });

  test("takes a signal file's settings", () => {
    const signal = { ...watcher, rule: { run: "pr-watcher", with: { wakeOn: ["ci-red"] } } };
    expect(loadSignals([signal]).plans.get("pr-watcher")).toMatchObject({
      source: "file",
      settings: { done: true, wakeOn: ["ci-red"] },
    });
  });

  test.each([
    [
      "an unknown action",
      { ...watcher, action: { run: "paperclip.task" } },
      "unrecognized_keys at ",
    ],
    [
      "a key-looking field",
      { ...watcher, rule: { run: "pr-watcher", with: { githubToken: "x" } } },
      "unrecognized_keys at rule.with",
    ],
    [
      "a key as its id",
      { ...watcher, id: `sk-${"q7x2lm9k".repeat(4)}` },
      "value-looks-like-key at id",
    ],
  ])("turns the rule off for a signal with %s, never on", (_, signal, why) => {
    const { plans, lines } = loadSignals([signal]);
    expect(plans.get("pr-watcher")).toBe("off");
    expect(lines).toEqual([`Signals: signals[0] is refused (${why}), so pr-watcher is off.`]);
  });

  test("runs nothing for an unknown rule, and keeps the other rules as they are", () => {
    const { plans, lines } = loadSignals([{ ...watcher, rule: { run: "shell.run" } }]);
    expect(plans.get("pr-watcher")).toMatchObject({ source: "default" });
    expect(lines).toEqual([
      "Signals: signals[0] is refused (invalid_union at rule.run), so it is off.",
    ]);
  });

  test("turns a rule off when two signals name it, and every rule off for a list that isn't one", () => {
    const twice = loadSignals([watcher, { ...watcher, id: "again" }]);
    expect(twice.plans.get("pr-watcher")).toBe("off");
    expect(twice.lines).toEqual([
      "Signals: signals[1] names pr-watcher again, so pr-watcher is off.",
    ]);
    expect(loadSignals({ watcher }).plans.get("pr-watcher")).toBe("off");
  });
});
