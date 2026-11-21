import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { committedVersions } from "../../test/committed-versions.ts";
import { workspaceAgentNames } from "./agent-names.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-agent-names-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** This test starts a real git repository and commits twice (see `committedVersions`). */
const slowTest = { timeout: 60_000 };

const agent = (id: string, name: string) => `id: ${id}\nname: ${name}\ninstructions: Help Acme.\n`;

async function workspaceOf(files: Record<string, string>): Promise<LoadedWorkspace> {
  const all = { "workspace.yaml": "id: acme\nname: Acme\n", ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

describe("the agents' names a served workspace gives its waiting list", () => {
  verifies("cli.commands.serve.agent-names", () => {
    it("names each agent by its id, as its file says", async () => {
      const workspace = await workspaceOf({
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/agents/writer.agent.yaml": agent("writer", "Writer"),
        "hubs/support/agents/sorter.agent.yaml": agent("sorter", "Sorter"),
      });
      const names = await workspaceAgentNames(async () => workspace)();
      expect(Object.fromEntries(names)).toEqual({ writer: "Writer", sorter: "Sorter" });
    });

    it("takes the first file's name when two agent files have the same id", async () => {
      const workspace = await workspaceOf({
        "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
        "hubs/billing/agents/writer.agent.yaml": agent("writer", "Billing writer"),
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/agents/writer.agent.yaml": agent("writer", "Support writer"),
      });
      const files = filesOf(workspace, "agent");
      expect(files).toHaveLength(2);
      const first = files[0]?.value.name;
      expect((await workspaceAgentNames(async () => workspace)()).get("writer")).toBe(first);
    });

    it("reads the workspace served now at every call", async () => {
      let served = await workspaceOf({
        "hubs/support/hub.yaml": "id: support\nname: Support\n",
        "hubs/support/agents/writer.agent.yaml": agent("writer", "Writer"),
      });
      const names = workspaceAgentNames(async () => served);
      expect((await names()).get("writer")).toBe("Writer");
      served = await workspaceOf({
        "hubs/support/agents/writer.agent.yaml": agent("writer", "Copywriter"),
      });
      expect((await names()).get("writer")).toBe("Copywriter");
    });

    it(
      "names a renamed agent once the rename is committed, before a run starts",
      slowTest,
      async () => {
        await workspaceOf({
          "hubs/support/hub.yaml": "id: support\nname: Support\n",
          "hubs/support/agents/writer.agent.yaml": agent("writer", "Writer"),
        });
        const { versions, commitAll } = await committedVersions(root);
        try {
          const names = workspaceAgentNames(() => versions.live());
          expect((await names()).get("writer")).toBe("Writer");

          writeFileSync(
            join(root, "hubs/support/agents/writer.agent.yaml"),
            agent("writer", "Copywriter"),
          );
          // Saved but not committed: the live version still names it Writer.
          expect((await names()).get("writer")).toBe("Writer");
          await commitAll();

          expect((await names()).get("writer")).toBe("Copywriter");
          // No run started from the new version, so the one read last is still the first.
          expect(filesOf(versions.latest(), "agent")[0]?.value.name).toBe("Writer");
        } finally {
          await versions.close();
        }
      },
    );
  });
});
