import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.spec.ts";
import { PR_WATCHER_WAKES, signalRuleInfo, signalRuleNames } from "./rules.ts";

/** An invented key in a format `findSecretShape` knows, all lowercase so it fits an id; never a real one. */
const lowercaseKey = `sk-${"q7x2lm9k".repeat(4)}`;

/** A signal file for the PR watcher, with `extra` lines added at the end. */
function signalFile(...extra: string[]): string {
  return yaml("id: watcher", "rule:", "  run: pr-watcher", ...extra);
}

verifies("format.signal-file", () => {
  it("reads a signal and fills in version, dryRun and every setting with today's behaviour", () => {
    expect(parsedValue("signal", signalFile())).toEqual({
      version: 1,
      id: "watcher",
      rule: { run: "pr-watcher", with: { done: true, wakeOn: [...PR_WATCHER_WAKES] } },
      dryRun: false,
    });
  });

  it("takes the settings and dry run a file gives", () => {
    const value = parsedValue(
      "signal",
      signalFile("  with: { done: false, wakeOn: [ci-red, conflict] }", "dryRun: true"),
    );
    expect(value.rule.with).toEqual({ done: false, wakeOn: ["ci-red", "conflict"] });
    expect(value.dryRun).toBe(true);
  });

  it("takes its id from the file name when it has none", () => {
    const text = yaml("rule: { run: pr-watcher }");
    expect(parsedValue("signal", text, "nightly").id).toBe("nightly");
  });

  it("lists every rule with whether it writes", () => {
    expect(signalRuleNames()).toEqual([
      "pr-watcher",
      "board-ask",
      "task-effort",
      "fast-track",
      "thin-spec",
      "rule-checks",
    ]);
    expect(signalRuleNames().map((name) => signalRuleInfo(name).writes)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });

  it("fills in today's settings for the fast-track rule, and takes a file's", () => {
    expect(parsedValue("signal", yaml("id: fast", "rule: { run: fast-track }")).rule).toEqual({
      run: "fast-track",
      with: {
        reviewEscalateMinutes: 15,
        enqueueAfterMinutes: 10,
        queueSlowMinutes: 30,
        jumpAhead: 8,
      },
    });
    const text = yaml("id: fast", "rule:", "  run: fast-track", "  with: { jumpAhead: 12 }");
    expect(parsedValue("signal", text).rule.with).toMatchObject({
      jumpAhead: 12,
      queueSlowMinutes: 30,
    });
  });

  it("fills in today's settings for the board-ask and task-effort rules, and takes a file's", () => {
    expect(parsedValue("signal", yaml("id: asks", "rule: { run: board-ask }")).rule).toEqual({
      run: "board-ask",
      with: { windowMinutes: 12, wake: true },
    });
    expect(parsedValue("signal", yaml("id: effort", "rule: { run: task-effort }")).rule).toEqual({
      run: "task-effort",
      with: { highFrom: 4, highAfterSendBack: true },
    });
    const text = yaml("id: effort", "rule:", "  run: task-effort", "  with: { highFrom: 3 }");
    expect(parsedValue("signal", text).rule.with).toEqual({ highFrom: 3, highAfterSendBack: true });
  });

  it("fills in today's settings for the thin-spec and rule-checks rules", () => {
    expect(parsedValue("signal", yaml("id: spec", "rule: { run: thin-spec }")).rule).toEqual({
      run: "thin-spec",
      with: { threshold: 0.5, upTo: 4, newForHours: 24, doneWhen: true },
    });
    expect(parsedValue("signal", yaml("id: checks", "rule: { run: rule-checks }")).rule).toEqual({
      run: "rule-checks",
      with: { shortestMonitorMinutes: 15, inProgressLimit: 10 },
    });
  });
});

verifies("format.signal-refusals", () => {
  it("refuses a rule the runtime doesn't offer", () => {
    const text = yaml("id: watcher", "rule: { run: shell.run }");
    expect(summary(problemsOf("signal", text))).toEqual(["rule.run invalid_union 2"]);
  });

  it("refuses an action, a host or a script at any depth", () => {
    expect(summary(problemsOf("signal", signalFile("action: { run: paperclip.task }")))).toEqual([
      " unrecognized_keys 4",
    ]);
    expect(summary(problemsOf("signal", signalFile("  with: { host: example.com }")))).toEqual([
      "rule.with unrecognized_keys 4",
    ]);
    expect(summary(problemsOf("signal", signalFile("  script: run.sh")))).toEqual([
      "rule unrecognized_keys 4",
    ]);
  });

  it("refuses a field that asks for a key, and a wake state it doesn't know", () => {
    expect(summary(problemsOf("signal", signalFile("token: abc")))).toEqual([
      " unrecognized_keys 4",
    ]);
    expect(summary(problemsOf("signal", signalFile("  with: { githubToken: abc }")))).toEqual([
      "rule.with unrecognized_keys 4",
    ]);
    expect(summary(problemsOf("signal", signalFile("  with: { wakeOn: [deploy] }")))).toEqual([
      "rule.with.wakeOn.0 invalid_value 4",
    ]);
  });

  it("refuses another rule's setting, and a setting out of range", () => {
    const asks = (line: string) => yaml("id: asks", "rule:", "  run: board-ask", line);
    expect(summary(problemsOf("signal", asks("  with: { wakeOn: [ci-red] }")))).toEqual([
      "rule.with unrecognized_keys 4",
    ]);
    expect(summary(problemsOf("signal", asks("  with: { windowMinutes: 600 }")))).toEqual([
      "rule.with.windowMinutes too_big 4",
    ]);
    const effort = yaml("id: effort", "rule:", "  run: task-effort", "  with: { effort: max }");
    expect(summary(problemsOf("signal", effort))).toEqual(["rule.with unrecognized_keys 4"]);
    const fast = (line: string) => yaml("id: fast", "rule:", "  run: fast-track", line);
    expect(summary(problemsOf("signal", fast("  with: { labelAdder: someone }")))).toEqual([
      "rule.with unrecognized_keys 4",
    ]);
    expect(summary(problemsOf("signal", fast("  with: { jumpAhead: 2 }")))).toEqual([
      "rule.with.jumpAhead too_small 4",
    ]);
    const spec = (line: string) => yaml("id: spec", "rule:", "  run: thin-spec", line);
    expect(summary(problemsOf("signal", spec("  with: { threshold: 2 }")))).toEqual([
      "rule.with.threshold too_big 4",
    ]);
    expect(summary(problemsOf("signal", spec("  with: { clarifier: pm }")))).toEqual([
      "rule.with unrecognized_keys 4",
    ]);
    const checks = yaml(
      "id: checks",
      "rule:",
      "  run: rule-checks",
      "  with: { checks: [workload] }",
    );
    expect(summary(problemsOf("signal", checks))).toEqual(["rule.with unrecognized_keys 4"]);
  });

  it("refuses a key written as its id, without repeating it", () => {
    const text = yaml("rule: { run: pr-watcher }");
    const problems = problemsOf("signal", text, lowercaseKey);
    expect(problems.map((problem) => `${problem.path.join(".")} ${problem.code}`)).toEqual([
      "id value-looks-like-key",
    ]);
    expect(problems[0]?.message).not.toContain(lowercaseKey);
  });

  it("refuses a signal file over 16 KiB before parsing it", () => {
    const padding = `# ${"x".repeat(16 * 1024)}`;
    expect(summary(problemsOf("signal", `${signalFile()}${padding}\n`))).toEqual([
      " file-too-large 1",
    ]);
  });
});
