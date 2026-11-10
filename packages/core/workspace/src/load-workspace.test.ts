import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { UnreadableWorkspaceFolderError } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
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

/** A workspace always has its settings file; the tests below add theirs to it. */
const settings = { "workspace.yaml": "id: acme\nname: Acme\n" };

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
      ...settings,
      "agents/clerk.agent.yaml": "name: Clerk\noutput:\n  type: xml\n",
      "agents/notifier.agent.yaml": "name: Notifier\n",
    });
    const workspace = await loadWorkspace(source);
    expect(workspace.files.map((file) => file.path)).toEqual([
      "agents/notifier.agent.yaml",
      "workspace.yaml",
    ]);
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
      new MemorySource({ ...settings, "providers/Spare.yaml": "type: mock\n" }),
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
      new MemorySource({ ...settings, "library/connectors/files.connector.yaml": connector }),
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
        ...settings,
        "hubs/billing/.halonic/source.json": "{}",
        ".halonic/staging/agents/a.agent.yaml": "name: [",
        ".Halonic./staging/agents/b.agent.yaml": "name: [",
        "notes/README.md": "# Notes\n",
      }),
    );
    expect(workspace.ignored).toEqual(["notes/README.md"]);
    expect(workspace.files.map((file) => file.path)).toEqual(["workspace.yaml"]);
    expect(workspace.issues).toEqual([]);
  });

  it("leaves out a file removed between listing and reading", async () => {
    const workspace = await loadWorkspace(
      new MemorySource({ ...settings, "agents/clerk.agent.yaml": "name: Clerk\n" }, [
        "agents/gone.agent.yaml",
      ]),
    );
    expect(workspace.files.map((file) => file.path)).toEqual([
      "agents/clerk.agent.yaml",
      "workspace.yaml",
    ]);
    expect(workspace.issues).toEqual([]);
  });

  it("gives the source's location and version", async () => {
    const workspace = await loadWorkspace(new MemorySource({}));
    expect([workspace.location, workspace.version]).toEqual(["memory:acme", "v1"]);
  });
});

/**
 * A source whose `read` of one file fails with `error`, as a folder store
 * does for a file it may not read. Its version reads every file, as the
 * folder store's does, so it fails first.
 */
class RefusingSource extends MemorySource {
  private readonly refused: string;
  private readonly error: unknown;

  constructor(files: Record<string, string>, refused: string, error: unknown) {
    super(files);
    this.refused = refused;
    this.error = error;
  }

  override async read(path: string): Promise<string | null> {
    if (path === this.refused) {
      throw this.error;
    }
    return await super.read(path);
  }

  override async version(): Promise<string> {
    const texts = await Promise.all((await this.list()).map((path) => this.read(path)));
    return `v${texts.length}`;
  }
}

/** An error with the `code` Node gives a failed file read. */
function fileError(code: string): Error {
  return Object.assign(new Error(`${code}: the read failed`), { code });
}

verifies("workspace.unreadable-file", () => {
  const sorter = "hubs/support/agents/sorter.agent.yaml";
  const files = { ...settings, [sorter]: "name: Sorter\n" };

  it.each(["EACCES", "EPERM"])(
    "names a file the source refuses with %s and gives the fix",
    async (code) => {
      const cause = fileError(code);
      const loading = loadWorkspace(new RefusingSource(files, sorter, cause));

      await expect(loading).rejects.toThrow(KindedError);
      await expect(loading).rejects.toMatchObject({
        kind: "invalid_input",
        message: `the workspace file ${sorter} can't be read.`,
        fix: "Check the file's permissions, or move it out of the workspace.",
        cause,
      });
    },
  );

  it("names a file no kind places, since the version reads it too", async () => {
    const readme = "notes/README.md";
    const source = new RefusingSource(
      { ...files, [readme]: "# Notes\n" },
      readme,
      fileError("EACCES"),
    );

    await expect(loadWorkspace(source)).rejects.toMatchObject({
      kind: "invalid_input",
      message: `the workspace file ${readme} can't be read.`,
    });
  });

  it("passes on what the version said when every file reads on its own", async () => {
    const error = fileError("EACCES");
    const source = new MemorySource(files);
    source.version = () => Promise.reject(error);

    await expect(loadWorkspace(source)).rejects.toBe(error);
  });

  it("passes on any other error from the source as it is", async () => {
    const error = fileError("EIO");
    await expect(loadWorkspace(new RefusingSource(files, sorter, error))).rejects.toBe(error);
  });
});

/** A folder store's error for `folder`, which the account may not read. */
function folderError(folder: string): UnreadableWorkspaceFolderError {
  return new UnreadableWorkspaceFolderError(
    folder,
    `The workspace folder ${folder} can't be read.`,
    {
      cause: fileError("EACCES"),
    },
  );
}

verifies("workspace.unreadable-folder", () => {
  const files = { ...settings, "hubs/support/hub.yaml": "id: support\nname: Support\n" };

  it("names a folder the source can't list and gives the fix", async () => {
    const cause = folderError("hubs/support/agents");
    const source = new MemorySource(files);
    source.list = () => Promise.reject(cause);

    const loading = loadWorkspace(source);

    await expect(loading).rejects.toThrow(KindedError);
    await expect(loading).rejects.toMatchObject({
      kind: "invalid_input",
      message: "the workspace folder hubs/support/agents can't be read.",
      fix: "Check the folder's permissions, or move it out of the workspace.",
      cause,
    });
  });

  it("names the folder when the source's version fails on it first", async () => {
    const cause = folderError("hubs/support/agents");
    const source = new MemorySource(files);
    source.version = () => Promise.reject(cause);

    await expect(loadWorkspace(source)).rejects.toMatchObject({
      kind: "invalid_input",
      message: "the workspace folder hubs/support/agents can't be read.",
      cause,
    });
  });

  it("names the folder when the version fails on a file code and the listing on the folder", async () => {
    const source = new MemorySource(files);
    source.version = () => Promise.reject(fileError("EACCES"));
    source.list = () => Promise.reject(folderError("notes"));

    await expect(loadWorkspace(source)).rejects.toMatchObject({
      kind: "invalid_input",
      message: "the workspace folder notes can't be read.",
    });
  });

  it("passes on any other error from the listing as it is", async () => {
    const error = fileError("EIO");
    const source = new MemorySource(files);
    source.list = () => Promise.reject(error);

    await expect(loadWorkspace(source)).rejects.toBe(error);
  });
});
