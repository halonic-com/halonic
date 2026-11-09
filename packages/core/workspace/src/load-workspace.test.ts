import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { beforeAll, describe, expect, it } from "vitest";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

const baseFiles = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "testing",
  "parity",
  "fixtures",
  "base",
  "files",
);

/** The parity fixtures' base workspace, read from disk into memory. */
function baseWorkspace(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(baseFiles, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      files[relative(baseFiles, path).split(sep).join("/")] = readFileSync(path, "utf8");
    }
  }
  return files;
}

verifies("workspace.load", () => {
  describe("the parity fixtures' base workspace", () => {
    let paths: string[];
    let workspace: LoadedWorkspace;
    // Reading and parsing all 32 files takes about 3 s on the agent runner and far more
    // under a full verify; the hook's default limit of 10 s is too tight.
    const loadLimitMs = 60_000;
    beforeAll(async () => {
      const files = baseWorkspace();
      paths = Object.keys(files).sort();
      workspace = await loadWorkspace(new MemorySource(files));
    }, loadLimitMs);

    it("parses every file, with no error", () => {
      expect(workspace.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      expect(workspace.ignored).toEqual([]);
      expect(workspace.files).toHaveLength(32);
      expect(workspace.files.map((file) => file.path)).toEqual(paths);
    });

    it("gives each file its kind, hub and id", () => {
      const agents = filesOf(workspace, "agent").map((file) => `${file.hub}/${file.value.id}`);
      expect(agents).toEqual([
        "billing/checker",
        "billing/clerk",
        "billing/notifier",
        "billing/reviewer",
      ]);
      expect(filesOf(workspace, "hub").map((file) => file.value.id)).toEqual(["billing"]);
      expect(filesOf(workspace, "skill").map((file) => `${file.hub}/${file.value.id}`)).toEqual([
        "billing/invoice-style",
        "null/plain-words",
      ]);
      expect(filesOf(workspace, "workspace")).toHaveLength(1);
    });
  });

  it("leaves a file with an error out and gives the issue its file, key path and line", async () => {
    const source = new MemorySource({
      "agents/clerk.agent.yaml": "name: Clerk\noutput:\n  type: xml\n",
      "agents/notifier.agent.yaml": "name: Notifier\n",
    });
    const workspace = await loadWorkspace(source);
    expect(workspace.files.map((file) => file.path)).toEqual(["agents/notifier.agent.yaml"]);
    expect(workspace.issues).toHaveLength(1);
    expect(workspace.issues[0]).toMatchObject({
      file: "agents/clerk.agent.yaml",
      severity: "error",
      source: "schema",
      path: ["output", "type"],
      line: 3,
      col: 9,
    });
  });

  it("says when a failing id comes from the file name", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({ "providers/Spare.yaml": "type: mock\n" }),
    );
    expect(workspace.issues.map((issue) => [issue.file, issue.path, issue.message])).toEqual([
      [
        "providers/Spare.yaml",
        ["id"],
        expect.stringContaining('the id "Spare" comes from the file name'),
      ],
    ]);
  });

  it("keeps a file with a warning and lists the warning with its file", async () => {
    const connector = [
      "name: Files",
      "transport:",
      "  stdio:",
      "    command: acme-files-server",
      "tools:",
      "  allow: [read_file]",
      "  approve: [write_file]",
      "",
    ].join("\n");
    const workspace = await loadWorkspace(
      new MemorySource({ "library/connectors/files.connector.yaml": connector }),
    );
    expect(filesOf(workspace, "connector").map((file) => file.value.id)).toEqual(["files"]);
    expect(workspace.issues).toEqual([
      expect.objectContaining({
        file: "library/connectors/files.connector.yaml",
        severity: "warning",
        code: "approved-tool-not-allowed",
        path: ["tools", "approve", 0],
        line: 7,
      }),
    ]);
  });

  it("skips the reserved folders and lists the files no kind places", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({
        "hubs/billing/.halonic/source.json": "{}",
        ".halonic/staging/agents/a.agent.yaml": "name: [",
        "notes/README.md": "# Notes\n",
      }),
    );
    expect(workspace.ignored).toEqual(["notes/README.md"]);
    expect(workspace.files).toEqual([]);
    expect(workspace.issues).toEqual([]);
  });

  it("leaves out a file removed between listing and reading", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({ "agents/clerk.agent.yaml": "name: Clerk\n" }, ["agents/gone.agent.yaml"]),
    );
    expect(workspace.files.map((file) => file.path)).toEqual(["agents/clerk.agent.yaml"]);
    expect(workspace.issues).toEqual([]);
  });

  it("gives the source's location and version", async () => {
    const workspace = await loadWorkspace(new MemorySource({}));
    expect([workspace.location, workspace.version]).toEqual(["memory:acme", "v1"]);
  });
});
