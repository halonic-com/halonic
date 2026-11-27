import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystemFolderReader } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryDefinitionStore, MemoryTrustStore } from "@halonicjs/adapter-memory";
import { TrustService } from "@halonicjs/app";
import type { RunStore } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceTrust } from "../studio/workspace-trust.ts";
import { WorkspaceRuns } from "./workspace-runs.ts";

let folder: string;

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-open-once-")));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Acme with one workflow, and a count of how often the workspace was loaded (each load asks its version once). */
function acmeDefinitions() {
  const definitions = new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/acme/hub.yaml": "id: acme\nname: Acme\n",
    "hubs/acme/workflows/reply.workflow.yaml":
      "id: reply\nname: Reply to a customer\ninitial: done\nstates:\n  done:\n    type: final\n",
  });
  const loads = vi.spyOn(definitions, "version");
  return { definitions, loads };
}

function trustOf(definitions: MemoryDefinitionStore): WorkspaceTrust {
  return new WorkspaceTrust({
    definitions,
    folder: new FileSystemFolderReader(folder, folder),
    findCommand: async () => undefined,
    digest: webCryptoDigest,
    trust: new TrustService({
      store: new MemoryTrustStore(),
      digest: webCryptoDigest,
      clock: fixedClock(),
      appVersion: "0.1.0",
    }),
  });
}

const noRuns: Pick<RunStore, "list" | "events"> = {
  list: async () => [],
  events: async () => [],
};

verifies("studio.open-loads-once", () => {
  it("loads the workspace once when it opens: the runs take the trust check's load", async () => {
    const { definitions, loads } = acmeDefinitions();
    const trust = trustOf(definitions);
    await trust.refresh();
    const runs = new WorkspaceRuns({ runs: noRuns, definitions, loaded: () => trust.loaded });

    await runs.list();

    expect(loads).toHaveBeenCalledTimes(1);
    expect(runs.workflow("acme", "reply")?.name).toBe("Reply to a customer");
  });

  it("loads the workspace for the runs when the trust check failed", async () => {
    const { definitions, loads } = acmeDefinitions();
    const trust = trustOf(definitions);
    await rm(folder, { recursive: true, force: true });
    await trust.refresh();
    expect(trust.failure).toBeDefined();
    expect(trust.loaded).toBeUndefined();
    const runs = new WorkspaceRuns({ runs: noRuns, definitions, loaded: () => trust.loaded });

    await runs.list();

    expect(loads).toHaveBeenCalledTimes(2);
    expect(runs.workflow("acme", "reply")?.name).toBe("Reply to a customer");
  });

  it("loads the workspace again once the files changed, not from the trust check's load", async () => {
    const { definitions, loads } = acmeDefinitions();
    const trust = trustOf(definitions);
    await trust.refresh();
    const runs = new WorkspaceRuns({ runs: noRuns, definitions, loaded: () => trust.loaded });
    let heard = () => {};
    const changed = new Promise<void>((resolve) => {
      heard = resolve;
    });
    const stop = runs.subscribe(() => heard());
    await runs.list();
    // The watch opens after the first read of the runs.
    await new Promise((resolve) => setTimeout(resolve, 0));
    definitions.changeOutside({
      "hubs/acme/workflows/reply.workflow.yaml":
        "id: reply\nname: Answer\ninitial: done\nstates:\n  done:\n    type: final\n",
    });
    await changed;

    await runs.list();

    expect(loads).toHaveBeenCalledTimes(2);
    expect(runs.workflow("acme", "reply")?.name).toBe("Answer");
    stop();
    await runs.dispose();
  });
});
