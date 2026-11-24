import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { yaml } from "../test/parse.spec.ts";
import { buildSnapshot, type SnapshotInput, type ToolFile } from "./build.ts";
import { readSnapshot, snapshotJson } from "./read.ts";
import type { SnapshotProblem, WorkspaceSnapshot } from "./schema.ts";

/** A made-up key in a known key format, built at run time so no key-shaped text sits in the repo. */
const fakeKey = `sk-${"Q7x2Lm9K".repeat(4)}`;

const commit = "0123456789abcdef0123456789abcdef01234567";
const actions = new Set(["github.pull-request-status", "github.queue-state"]);

const prStatus: ToolFile = {
  path: "tools/pr_status.tool.yaml",
  text: yaml(
    "name: pr_status",
    "description: Show a pull request's checks.",
    "action: github.pull-request-status",
    "callers: { everyone: true }",
    "parameters:",
    "  pr: { type: integer, description: The pull request number., required: true }",
  ),
};

const queueState: ToolFile = {
  path: "tools/queue_state.tool.yaml",
  text: yaml(
    "name: queue_state",
    "description: Show the merge queue.",
    "action: github.queue-state",
  ),
};

/** Builds a snapshot that must pass. */
function built(input: Partial<SnapshotInput> = {}): WorkspaceSnapshot {
  const result = buildSnapshot({ commit, toolFiles: [prStatus, queueState], actions, ...input });
  if (!result.ok) {
    expect.fail(`expected the build to pass, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** Builds a snapshot that must fail, and gives its problems. */
function refused(input: Partial<SnapshotInput>): SnapshotProblem[] {
  const result = buildSnapshot({ commit, toolFiles: [prStatus], actions, ...input });
  if (result.ok) {
    expect.fail(`expected the build to fail, got ${JSON.stringify(result.value)}`);
  }
  return result.error;
}

/** Each problem as "file path code". */
function summary(problems: readonly SnapshotProblem[]): string[] {
  return problems.map(
    (problem) => `${problem.file ?? "-"} ${problem.path.join(".")} ${problem.code}`,
  );
}

verifies("format.workspace-snapshot", () => {
  describe("building", () => {
    it("loads a valid tool file into the snapshot, with its defaults and the commit", () => {
      expect(built({ toolFiles: [prStatus] })).toEqual({
        snapshot: 1,
        commit,
        tools: [
          {
            name: "pr_status",
            description: "Show a pull request's checks.",
            action: "github.pull-request-status",
            callers: { everyone: true, agents: [] },
            parameters: {
              pr: { type: "integer", description: "The pull request number.", required: true },
            },
          },
        ],
      });
    });

    it("refuses a tool whose action the runtime doesn't have", () => {
      const toolFiles = [
        { ...prStatus, text: prStatus.text.replace("pull-request-status", "run-shell") },
      ];
      expect(summary(refused({ toolFiles }))).toEqual([
        "tools/pr_status.tool.yaml action tool-action-unknown",
      ]);
    });

    it("refuses a tool file with a key in a field, naming the file but not the key", () => {
      const toolFiles = [
        { ...prStatus, text: prStatus.text.replace("checks.", `checks with ${fakeKey}`) },
      ];
      const problems = refused({ toolFiles });
      expect(summary(problems)).toEqual([
        "tools/pr_status.tool.yaml description value-looks-like-key",
      ]);
      expect(JSON.stringify(problems)).not.toContain(fakeKey);
    });

    it("refuses an invalid file and names every problem, not just the first", () => {
      const broken = { path: "tools/broken.tool.yaml", text: yaml("name: Broken", "action: x") };
      expect(summary(refused({ toolFiles: [prStatus, broken] }))).toEqual([
        "tools/broken.tool.yaml name invalid_format",
        "tools/broken.tool.yaml description invalid_type",
        "tools/broken.tool.yaml action invalid_format",
      ]);
    });

    it("refuses two tools with one name", () => {
      const copy = { ...prStatus, path: "tools/copy.tool.yaml" };
      expect(summary(refused({ toolFiles: [prStatus, copy] }))).toEqual([
        "tools/copy.tool.yaml name tool-name-taken",
      ]);
    });

    it("refuses a short commit id", () => {
      expect(summary(refused({ commit: "0123456" }))).toEqual(["- commit invalid_format"]);
    });

    it("writes the same bytes for the same files in any order", () => {
      const first = snapshotJson(built({ toolFiles: [prStatus, queueState] }));
      const second = snapshotJson(built({ toolFiles: [queueState, prStatus] }));
      expect(second).toBe(first);
      expect(first.endsWith("}\n")).toBe(true);
      expect(first.indexOf('"pr_status"')).toBeLessThan(first.indexOf('"queue_state"'));
    });
  });

  describe("reading", () => {
    const text = snapshotJson(built());

    it("reads back what was written", () => {
      expect(readSnapshot(text, actions)).toEqual({ ok: true, value: built() });
    });

    it("refuses a tool whose action this runtime doesn't have", () => {
      const result = readSnapshot(text, new Set(["github.queue-state"]));
      expect(result.ok ? [] : summary(result.error)).toEqual([
        "- tools.0.action tool-action-unknown",
      ]);
    });

    it("refuses a key put into a snapshot after it was built", () => {
      const changed = text.replace("Show the merge queue.", fakeKey);
      const result = readSnapshot(changed, actions);
      expect(result.ok ? [] : summary(result.error)).toEqual([
        "- tools.1.description value-looks-like-key",
      ]);
    });

    it.each([
      ["an unknown field", text.replace('{"commit"', '{"extra":1,"commit"'), "unrecognized_keys"],
      ["another snapshot number", text.replace('"snapshot":1', '"snapshot":2'), "invalid_value"],
      ["spaces", text.replace('"snapshot":1', '"snapshot": 1'), "snapshot-not-canonical"],
      [
        "a field out of order",
        text
          .replace(`{"commit":"${commit}",`, "{")
          .replace('"snapshot":1,', `"snapshot":1,"commit":"${commit}",`),
        "snapshot-not-canonical",
      ],
      ["text that isn't JSON", text.slice(0, -3), "snapshot-not-json"],
    ])("refuses %s", (_what, changed, code) => {
      const result = readSnapshot(changed, actions);
      expect(result.ok ? [] : result.error.map((problem) => problem.code)).toEqual([code]);
    });
  });
});
