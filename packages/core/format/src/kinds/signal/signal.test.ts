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
    expect(signalRuleNames()).toEqual(["pr-watcher", "board-ask", "task-effort"]);
    expect(signalRuleNames().map((name) => signalRuleInfo(name).writes)).toEqual([
      true,
      true,
      true,
    ]);
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
