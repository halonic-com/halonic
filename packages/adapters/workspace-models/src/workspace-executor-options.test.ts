import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { noListedToolApproval } from "@halonicjs/engine";
import type { Clock, Secrets } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workspaceExecutorOptions } from "./index.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-executor-options-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const secrets: Secrets = { get: async () => null };
const clock: Clock = { now: () => new Date("2026-11-15T10:00:00.000Z") };

/** The options of a workspace made of `files`, by path. */
async function optionsOf(files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const workspace = await loadWorkspace(new FolderDefinitionStore(root, "./acme"));
  return workspaceExecutorOptions({
    workspace,
    secrets,
    http: { fetch },
    clock,
    listedToolApproval: noListedToolApproval,
  });
}

verifies("cli.workspace-models", () => {
  describe("the executor options a workspace gives", () => {
    it("is local only when workspace.yaml says so", async () => {
      const options = await optionsOf({
        "workspace.yaml": "id: acme\nname: Acme\nprivacy:\n  localOnly: true\n",
      });

      expect(options.localOnly).toBe(true);
    });

    it("is not local only without workspace.yaml's privacy", async () => {
      const options = await optionsOf({ "workspace.yaml": "id: acme\nname: Acme\n" });

      expect(options.localOnly).toBe(false);
    });

    it("gives a chat agent its file, and none for an id the hub lacks", async () => {
      const options = await optionsOf({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\n",
      });
      const request = { hubId: "support", messages: [], tools: [] };

      expect((await options.chatAgentOf?.({ ...request, agentId: "writer" }))?.id).toBe("writer");
      expect(await options.chatAgentOf?.({ ...request, agentId: "ghost" })).toBeUndefined();
    });

    it("offers no Halonic tools and the given connectors, none by default", async () => {
      const options = await optionsOf({ "workspace.yaml": "id: acme\nname: Acme\n" });

      expect(options.halonicTools).toEqual([]);
      expect(options.connectors).toEqual([]);
    });
  });
});
