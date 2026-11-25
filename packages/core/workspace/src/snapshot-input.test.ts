import { makeSnapshot } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { filesOf, loadWorkspace, snapshotInputOf } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

const commit = "0123456789abcdef0123456789abcdef01234567";

/** A workspace with one tool that reads templates, two templates and a signal. */
const fixture = {
  "workspace.yaml": "id: acme\nname: Acme\n",
  "library/tools/template-get.tool.yaml": [
    "name: template_get",
    "description: Reads one of the workspace's templates.",
    "parameters:",
    "  id: { type: string, description: The template's id. }",
    "callers: everyone",
    "action: { run: paperclip.template }",
    "",
  ].join("\n"),
  "library/templates/task-spec.md": "---\ntitle: Task\n---\n\n## Goal\n\nDone when: …\n",
  "library/templates/card.md": "Question, options and a recommendation.\n",
  "library/signals/watcher.signal.yaml": "rule: { run: pr-watcher, with: { wakeOn: [ci-red] } }\n",
};

verifies("workspace.snapshot-input", () => {
  it("makes the snapshot of a fixture workspace with its templates sorted by id and its signal", async () => {
    const workspace = await loadWorkspace(new MemorySource(fixture));
    expect(workspace.issues).toEqual([]);
    const snapshot = makeSnapshot(snapshotInputOf(workspace, commit));
    if (!snapshot.ok) {
      expect.fail(JSON.stringify(snapshot.error));
    }
    expect(snapshot.value.workspace).toEqual({ name: "Acme", commit });
    expect(snapshot.value.tools.map((tool) => tool.action.run)).toEqual(["paperclip.template"]);
    expect(snapshot.value.templates).toEqual([
      { id: "card", body: "Question, options and a recommendation." },
      { id: "task-spec", title: "Task", body: "## Goal\n\nDone when: …" },
    ]);
    expect(snapshot.value.signals).toEqual([
      {
        version: 1,
        id: "watcher",
        rule: { run: "pr-watcher", with: { done: true, wakeOn: ["ci-red"] } },
        dryRun: false,
      },
    ]);
  });

  it("gives no routing when the workspace has no routing.yaml", async () => {
    const workspace = await loadWorkspace(new MemorySource(fixture));
    expect("routing" in snapshotInputOf(workspace, commit)).toBe(false);
  });
});

verifies("workspace.routing-file", () => {
  const routing = [
    "roles:",
    "  code-reviewer: liam",
    "  second-reviewer: julian",
    "areas:",
    "  engine-and-cli: priya",
    "",
  ].join("\n");

  it("puts the routing of routing.yaml in the snapshot input and the snapshot", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({ ...fixture, "routing.yaml": routing }),
    );
    expect(workspace.issues).toEqual([]);
    const input = snapshotInputOf(workspace, commit);
    expect(input.routing).toEqual({
      roles: { "code-reviewer": "liam", "second-reviewer": "julian" },
      areas: { "engine-and-cli": "priya" },
    });
    const snapshot = makeSnapshot(input);
    expect(snapshot.ok && snapshot.value.routing).toEqual(input.routing);
  });

  it.each([
    ["an email", "roles:\n  code-reviewer: liam@example.com\n", ["roles", "code-reviewer"]],
    ["an unknown role", "roles:\n  approver: liam\n", ["roles"]],
    ["an area named like an account", "areas:\n  github-login: liam\n", ["areas", "github-login"]],
  ])(
    "refuses a routing.yaml with %s as an error, so it never reaches the snapshot",
    async (_, text, path) => {
      const workspace = await loadWorkspace(new MemorySource({ ...fixture, "routing.yaml": text }));
      expect(workspace.issues).toMatchObject([{ file: "routing.yaml", severity: "error", path }]);
      expect(filesOf(workspace, "routing")).toEqual([]);
      expect("routing" in snapshotInputOf(workspace, commit)).toBe(false);
    },
  );
});
