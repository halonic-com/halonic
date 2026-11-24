import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expectSpecFile } from "@halonicjs/testing-spec/node";
import { expect, it } from "vitest";
import type { Tool } from "../kinds/tool/schema.ts";
import { snapshotJsonSchema } from "./schema.ts";
import { makeSnapshot, readSnapshot, type SnapshotProblem, snapshotText } from "./snapshot.ts";

const commit = "0123456789abcdef0123456789abcdef01234567";

/** A parsed tool with this name and id. */
function tool(name: string, id = name.replaceAll("_", "-")): Tool {
  return {
    version: 1,
    id,
    name,
    description: "Reads something.",
    parameters: {},
    callers: "everyone",
    action: { run: "paperclip.task", with: {} },
  };
}

/** The snapshot's problems as "path code", failing the test when it passes. */
function problemsOf(data: unknown): string[] {
  const read = readSnapshot(data);
  if (read.ok) {
    expect.fail("expected the snapshot to be refused");
  }
  return read.error.map((problem: SnapshotProblem) => `${problem.path.join(".")} ${problem.code}`);
}

/** A snapshot as JSON data, with the given tools. */
function snapshotData(tools: unknown[], extra: Record<string, unknown> = {}): unknown {
  return { format: 1, workspace: { name: "Acme", commit }, tools, ...extra };
}

verifies("format.workspace-snapshot", () => {
  it("makes a snapshot with the tools sorted by name, and reads it back unchanged", () => {
    const made = makeSnapshot({ name: "Acme", commit, tools: [tool("task_get"), tool("my_prs")] });
    if (!made.ok) {
      expect.fail(JSON.stringify(made.error));
    }
    expect(made.value.tools.map((item) => item.name)).toEqual(["my_prs", "task_get"]);
    expect(readSnapshot(JSON.parse(snapshotText(made.value)))).toEqual(made);
  });

  it("writes the same text for the same tools in any order", () => {
    const first = makeSnapshot({ name: "Acme", commit, tools: [tool("a_one"), tool("b_two")] });
    const second = makeSnapshot({ name: "Acme", commit, tools: [tool("b_two"), tool("a_one")] });
    expect(first.ok && second.ok && snapshotText(first.value) === snapshotText(second.value)).toBe(
      true,
    );
  });

  it("refuses another format, an unknown key, a short commit and an unknown action", () => {
    expect(problemsOf(snapshotData([], { format: 2 }))).toEqual(["format invalid_value"]);
    expect(problemsOf(snapshotData([], { signals: [] }))).toEqual([" unrecognized_keys"]);
    expect(
      problemsOf({ format: 1, workspace: { name: "Acme", commit: "abc1234" }, tools: [] }),
    ).toEqual(["workspace.commit invalid_format"]);
    const shell = { ...tool("run_it"), action: { run: "shell.run", with: {} } };
    expect(problemsOf(snapshotData([shell]))).toEqual(["tools.0.action.run invalid_union"]);
  });

  it("runs the tool file's refusals again on every tool", () => {
    const leaky = { ...tool("leaky"), description: `Use sk-ant-api03-${"Q7x2Lm9K".repeat(4)}.` };
    const asking = {
      ...tool("asking"),
      parameters: { token: { type: "boolean", description: "Pass it.", required: false } },
    };
    expect(problemsOf(snapshotData([asking, leaky]))).toEqual([
      "tools.0.parameters.token parameter-asks-for-key",
      "tools.1.description value-looks-like-key",
    ]);
  });

  it("refuses a name or id used twice, and tools out of name order", () => {
    expect(problemsOf(snapshotData([tool("my_prs"), tool("my_prs", "other")]))).toEqual([
      "tools.1.name tool-name-twice",
    ]);
    expect(problemsOf(snapshotData([tool("a_one", "same"), tool("b_two", "same")]))).toEqual([
      "tools.1.id tool-id-twice",
    ]);
    expect(problemsOf(snapshotData([tool("b_two"), tool("a_one")]))).toEqual([
      "tools.1 tools-not-sorted",
    ]);
  });

  it("refuses more than 200 tools", () => {
    const tools = Array.from({ length: 201 }, (_, index) =>
      tool(`t${String(index).padStart(3, "0")}`),
    );
    expect(problemsOf(snapshotData(tools))).toEqual(["tools too_big"]);
  });

  it("matches its committed spec file", () => {
    const path = join(import.meta.dirname, "..", "..", "spec", "workspace-snapshot.schema.json");
    expectSpecFile(path, snapshotJsonSchema());
  });
});
