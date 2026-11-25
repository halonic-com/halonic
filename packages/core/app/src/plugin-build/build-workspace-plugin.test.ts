import type { Template, Tool } from "@halonicjs/format";
import { readPreviousBuild } from "@halonicjs/plugin-build";
import { encodeUtf8, type Sha256, unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  buildWorkspacePlugin,
  type PluginRuntime,
  type WorkspacePluginRequest,
} from "./build-workspace-plugin.ts";

const digest: Sha256 = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const commit = "0123456789abcdef0123456789abcdef01234567";
const committed = { kind: "commit", id: commit, uncommitted: [] } as const;

/** An invented classic GitHub token. */
const githubToken = `ghp_${"Q7x2Lm9K3".repeat(4)}`;

/** A tool with the one required parameter its action reads. */
function tool(name: string, run: "github.pull-request" | "paperclip.task" = "github.pull-request") {
  const action =
    run === "paperclip.task"
      ? { run, with: {} }
      : { run, with: { repositories: ["acme/website"] } };
  const required = run === "paperclip.task" ? "task" : "pr";
  return {
    version: 1,
    id: name.replaceAll("_", "-"),
    name,
    description: `The ${name} tool.`,
    parameters: {
      [required]: { type: "string", description: `The ${required}.`, required: true },
    },
    callers: "everyone",
    action,
  } as Tool;
}

const runtime: PluginRuntime = {
  worker: encodeUtf8("export {};\n"),
  actions: [
    { name: "github.pull-request", available: true, capabilities: ["http.outbound"] },
    { name: "paperclip.task", available: false, capabilities: ["issues.read"] },
  ],
  capabilities: ["agent.tools.register"],
  settings: { githubToken: { type: "string", format: "secret-ref" } },
};

function request(
  tools: readonly Tool[],
  more: Partial<WorkspacePluginRequest> = {},
): WorkspacePluginRequest {
  return {
    workspace: { id: "acme", name: "Acme", errors: 0, commit: committed, tools },
    runtime,
    halonicVersion: "0.1.0",
    ...more,
  };
}

verifies("app.plugin-build", () => {
  it("gives the same bytes for the same request", async () => {
    const first = unwrap(await buildWorkspacePlugin(request([tool("pr_status")]), digest));
    const second = unwrap(await buildWorkspacePlugin(request([tool("pr_status")]), digest));

    expect(second.archive).toEqual(first.archive);
    expect(second.releaseText).toBe(first.releaseText);
    expect(first.archiveName).toBe("halonic-ws.acme-0.1.0.tar");
    expect(first.releaseName).toBe("halonic-ws.acme-0.1.0.release.json");
    expect(first.release).toMatchObject({
      pluginId: "halonic-ws.acme",
      version: "0.1.0",
      workspaceCommit: commit,
      changes: { added: ["pr_status"], removed: [], changed: [] },
    });
    expect(first.release.snapshotSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.release.snapshotSha256).not.toBe(first.release.sha256);
    expect(JSON.parse(first.releaseText)).toEqual(first.release);
  });

  it("puts the workspace's templates in the snapshot, sorted by id", async () => {
    const templates: Template[] = [
      { id: "task", title: "Task", body: "Done when:" },
      { id: "pr-body", body: "## Changeset" },
    ];
    const asked = request([tool("pr_status")]);
    const built = unwrap(
      await buildWorkspacePlugin(
        { ...asked, workspace: { ...asked.workspace, templates } },
        digest,
      ),
    );
    const read = unwrap(
      await readPreviousBuild({ releaseFile: built.releaseText, archive: built.archive }, digest),
    );

    expect(read.snapshot).toMatchObject({
      templates: [
        { id: "pr-body", body: "## Changeset" },
        { id: "task", title: "Task", body: "Done when:" },
      ],
    });
  });

  it("serves no templates when the workspace has none", async () => {
    const built = unwrap(await buildWorkspacePlugin(request([tool("pr_status")]), digest));
    const read = unwrap(
      await readPreviousBuild({ releaseFile: built.releaseText, archive: built.archive }, digest),
    );

    expect(read.snapshot).not.toHaveProperty("templates");
  });

  it("takes the capabilities from the runtime and the used actions only", async () => {
    const built = unwrap(await buildWorkspacePlugin(request([tool("pr_status")]), digest));
    const text = new TextDecoder().decode(built.archive);

    expect(text).toContain('"capabilities":["agent.tools.register","http.outbound"]');
    expect(text).not.toContain("issues.read");
  });

  it.each([
    [{ errors: 2 }, { code: "workspace-errors", errors: 2 }],
    [{ commit: { kind: "no-repository" } }, { code: "no-repository" }],
    [{ commit: { kind: "no-commit" } }, { code: "no-commit" }],
    [
      { commit: { ...committed, uncommitted: ["library/tools/pr-status.tool.yaml"] } },
      { code: "uncommitted", files: ["library/tools/pr-status.tool.yaml"] },
    ],
  ] as const)("refuses a workspace with %o", async (workspace, error) => {
    const asked = request([tool("pr_status")]);
    const built = await buildWorkspacePlugin(
      { ...asked, workspace: { ...asked.workspace, ...workspace } },
      digest,
    );

    expect(built).toEqual({ ok: false, error });
  });

  it("refuses a tool whose action the runtime can't run", async () => {
    const built = await buildWorkspacePlugin(
      request([tool("pr_status"), tool("task_get", "paperclip.task")]),
      digest,
    );

    expect(built).toEqual({
      ok: false,
      error: {
        code: "action-unavailable",
        tools: [{ tool: "task_get", action: "paperclip.task" }],
      },
    });
  });

  it("refuses a tool the snapshot check refuses", async () => {
    const leaky = { ...tool("pr_status"), description: `Uses ${githubToken}.` };
    const built = await buildWorkspacePlugin(request([leaky]), digest);

    expect(built.ok).toBe(false);
    expect(!built.ok && built.error.code).toBe("snapshot");
    expect(JSON.stringify(built)).not.toContain(githubToken);
  });

  it("refuses a workspace id that gives no plugin id", async () => {
    const built = await buildWorkspacePlugin(
      { ...request([]), workspace: { ...request([]).workspace, id: "Acme_Shop" } },
      digest,
    );

    expect(built).toEqual({
      ok: false,
      error: { code: "bad-plugin-id", pluginId: "halonic-ws.Acme_Shop" },
    });
  });

  describe("with a previous build", () => {
    async function previousOf(version: string, tools: readonly Tool[]) {
      const built = unwrap(await buildWorkspacePlugin(request(tools, { version }), digest));
      return { releaseFile: built.releaseText, archive: built.archive };
    }

    it("lists what changed and raises the minor version", async () => {
      const previous = await previousOf("0.3.0", [tool("pr_status")]);
      const built = unwrap(
        await buildWorkspacePlugin(
          request([tool("merge_times"), { ...tool("pr_status"), description: "Newer." }], {
            previous,
          }),
          digest,
        ),
      );

      expect(built.release.version).toBe("0.4.0");
      expect(built.release.changes).toEqual({
        added: ["merge_times"],
        removed: [],
        changed: [{ tool: "pr_status", fields: ["description"] }],
      });
    });

    it("refuses an archive that isn't the one its release file names", async () => {
      const previous = await previousOf("0.3.0", [tool("pr_status")]);
      const tampered = { ...previous, archive: new Uint8Array([...previous.archive, 0]) };
      const built = await buildWorkspacePlugin(request([], { previous: tampered }), digest);

      expect(!built.ok && built.error.code).toBe("previous-build");
    });

    it("refuses a previous build of another plugin", async () => {
      const other = unwrap(
        await buildWorkspacePlugin(
          { ...request([]), workspace: { ...request([]).workspace, id: "other", name: "Other" } },
          digest,
        ),
      );
      const previous = { releaseFile: other.releaseText, archive: other.archive };
      const built = await buildWorkspacePlugin(request([], { previous }), digest);

      expect(built).toEqual({
        ok: false,
        error: {
          code: "other-plugin",
          pluginId: "halonic-ws.acme",
          previousPluginId: "halonic-ws.other",
        },
      });
    });
  });
});
