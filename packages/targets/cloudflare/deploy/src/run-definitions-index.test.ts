import { createHash } from "node:crypto";
import {
  R2DefinitionSource,
  readRunDefinitionsIndex,
  type SnapshotBucket,
} from "@halonicjs/adapter-cloudflare-storage";
import { verifies } from "@halonicjs/testing-spec";
import { definitionsOf, loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import type { WorkerBinding } from "./api.ts";
import { type DeployOptions, deploy } from "./deploy.ts";
import { fakeCloudflareApi } from "./fake-api.ts";
import { rollback } from "./rollback.ts";
import { FilesSource, writeWorkspaceSnapshot } from "./write-workspace-snapshot.ts";

/** An invented workspace with one hub, `acme`, whose workflow is named `workflowName`. */
function acmeFiles(workflowName: string): Record<string, string> {
  return {
    "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: fast\n",
    "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
    "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/acme/agents/clerk.agent.yaml": "id: clerk\nname: Clerk\ninstructions: File orders.\n",
    "hubs/acme/workflows/intake.workflow.yaml": [
      "id: intake",
      `name: ${workflowName}`,
      "initial: work",
      "states:",
      "  work:",
      "    agent: clerk",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "",
    ].join("\n"),
  };
}

/** A bucket over objects kept as text by key, as the fake API keeps what it wrote. */
function textBucket(objects: Readonly<Record<string, string | Uint8Array>>): SnapshotBucket {
  return {
    async get(key) {
      const stored = objects[key];
      if (stored === undefined) {
        return null;
      }
      const bytes = typeof stored === "string" ? new TextEncoder().encode(stored) : stored;
      return { arrayBuffer: async () => new Uint8Array(bytes).buffer };
    },
  };
}

const script = "export default {};";
const hash = createHash("sha256").update(script).digest("hex");

/** A deploy of Worker `w` from `commit`, whose self-test passes. */
function deployOptions(commit: string, files: Record<string, string>): DeployOptions {
  return {
    accountId: "a1",
    worker: "w",
    environment: "production",
    source: {
      commit: async () => commit,
      changedFileCount: async () => 0,
      files: async () => files,
    },
    validate: async () => {},
    test: async () => {},
    prepare: async () => ({ bundle: { script, hash }, bindings: [], secrets: {} }),
    migrations: [],
    compatibilityDate: "2026-07-30",
    label: "mateo on test",
    upload: {
      sleep: async () => {},
      attempts: 1,
      fetch: (async () => Response.json({ ok: true, checks: [] })) as unknown as typeof fetch,
    },
  };
}

/** The snapshot version an upload's bindings pin it to. */
function pinnedSnapshot(bindings: readonly WorkerBinding[] | undefined): string {
  const pinned = bindings?.find((binding) => binding.name === "HALONIC_DEFINITIONS_VERSION");
  return String(pinned?.["text"]);
}

verifies("cloudflare-storage.run-definitions-index", () => {
  describe("the run-definitions index a deploy writes", () => {
    it("round-trips each hub's definitions, as the workspace's loader builds them", async () => {
      const files = acmeFiles("Intake");
      const objects: Record<string, string | Uint8Array> = {};
      await writeWorkspaceSnapshot({ put: async (key, value) => (objects[key] = value) }, files);

      const hubs = await readRunDefinitionsIndex(new R2DefinitionSource(textBucket(objects)));
      const workspace = await loadWorkspace(new FilesSource(files));
      expect(workspace.issues.filter((issue) => issue.severity === "error")).toEqual([]);
      expect(hubs).toEqual({ acme: definitionsOf(workspace, "acme") });
      expect(hubs["acme"]?.workflows["intake"]?.states["work"]).toMatchObject({ agent: "clerk" });
      expect(hubs["acme"]?.agents["clerk"]?.instructions).toBe("File orders.");
    });

    it("is written by deploy with the snapshot, and a rollback reads the matching one", async () => {
      const api = fakeCloudflareApi({ accounts: [], deployment: [{ id: "old", percentage: 100 }] });
      await deploy(api, deployOptions("a".repeat(40), acmeFiles("Intake A")));
      await deploy(api, deployOptions("b".repeat(40), acmeFiles("Intake B")));
      const bucket = textBucket(
        Object.fromEntries(
          Object.entries(api.written).map(([key, value]) => [key.replace(/^w-defs\//, ""), value]),
        ),
      );
      /** The workflow name the snapshot pinned by the upload `versionId` starts runs from. */
      const workflowNameOf = async (versionId: string | undefined) => {
        const upload = Number(versionId?.replace(/^v/, "")) - 1;
        const version = pinnedSnapshot(api.bindings[upload]);
        const hubs = await readRunDefinitionsIndex(new R2DefinitionSource(bucket, { version }));
        return hubs["acme"]?.workflows["intake"]?.name;
      };
      const live = async () => (await api.currentDeployment("a1", "w"))?.[0]?.id;

      expect(await workflowNameOf(await live())).toBe("Intake B");
      const result = await rollback(api, {
        accountId: "a1",
        worker: "w",
        label: "mateo on test",
        lock: { id: "mine", schedule: () => () => {} },
        fetch: (async () => Response.json({ status: "ok" })) as typeof fetch,
      });
      expect(result.mode).toBe("rolled-back");
      expect(await workflowNameOf(await live())).toBe("Intake A");
    });
  });
});
