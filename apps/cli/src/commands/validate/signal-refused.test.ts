import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { smallWorkspace, validateIn, writeFiles } from "../../test/validate-workspace.ts";

let folder: string;
let workspace: string;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-signal-refused-"));
  workspace = join(folder, "acme");
  vi.stubEnv("HALONIC_HOME", join(folder, "profile"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await removeTestFolder(folder);
});

/** The small workspace with one signal file holding `lines`. */
function withSignal(...lines: string[]): void {
  writeFiles(workspace, {
    ...smallWorkspace,
    "library/signals/watcher.signal.yaml": `${lines.join("\n")}\n`,
  });
}

verifies("cli.commands.validate.signal-refused", () => {
  it.each([
    ["an unknown rule", ["rule: { run: shell.run }"]],
    ["an action", ["rule: { run: pr-watcher }", "action: { run: paperclip.task }"]],
    ["a field named like a key", ["rule: { run: pr-watcher }", "token: abc"]],
  ])("refuses a signal file with %s", async (_, lines) => {
    withSignal(...lines);

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.join("\n")).toContain(`library${sep}signals${sep}watcher.signal.yaml`);
  });

  it.each([
    ["pr-watcher", "rule: { run: pr-watcher }"],
    ["board-ask", "rule: { run: board-ask, with: { windowMinutes: 20, wake: false } }"],
    ["task-effort", "rule: { run: task-effort, with: { highFrom: 3, highAfterSendBack: false } }"],
  ])("passes a signal file that picks the offered rule %s", async (_, line) => {
    withSignal(line);

    const { code } = await validateIn(workspace);

    expect(code).toBe(exitCode.ok);
  });

  it.each([
    ["board-ask", "rule: { run: board-ask, with: { wakeOn: [ci-red] } }"],
    ["task-effort", "rule: { run: task-effort, with: { effort: max } }"],
  ])("refuses a setting the rule %s doesn't know", async (_, line) => {
    withSignal(line);

    const { code, io } = await validateIn(workspace);

    expect(code).toBe(exitCode.failed);
    expect(io.stdout.join("\n")).toContain(`library${sep}signals${sep}watcher.signal.yaml`);
  });
});
