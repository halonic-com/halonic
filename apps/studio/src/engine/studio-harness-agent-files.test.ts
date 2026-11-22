// A harness agent's file for its placement comes from the version its run read (HAL-14229).

import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import type { RunVersionLoads } from "./page-run-versions.ts";
import { agentFilesOf } from "./studio-harness-host.ts";

const writerPath = "hubs/support/agents/writer.agent.yaml";

/** Acme with the `writer` agent's file as `text`. */
function acmeWithWriter(text: string): MemoryDefinitionStore {
  return new MemoryDefinitionStore({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    [writerPath]: text,
  });
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const live = { reads: "live-version", commit: "4f2a9c0de1b2", versionDate: "2026-11-11" } as const;

verifies("studio.engine-service", () => {
  it("reads a run's agent file from the version it read, not as saved now", async () => {
    const atCommit = "id: writer\nname: Writer\n";
    const saved = acmeWithWriter("id: writer\nname: Not live yet\n");
    const versions: RunVersionLoads = {
      loadedOf: async () => ({
        workspace: await loadWorkspace(acmeWithWriter(atCommit)),
        fileTexts: new Map([[writerPath, atCommit]]),
      }),
      forget: () => {},
    };

    const bytes = await agentFilesOf(saved, versions).bytesOf("support", "writer", {
      runId: "run_1",
      version: live,
    });

    expect(decode(bytes)).toBe(atCommit);
    await expect(
      agentFilesOf(saved, versions).bytesOf("support", "editor", { runId: "run_1", version: live }),
    ).rejects.toThrow('Hub "support" has no agent "editor".');
  });

  it("reads the saved file without the runs' versions", async () => {
    const saved = acmeWithWriter("id: writer\nname: Saved\n");
    const bytes = await agentFilesOf(saved, undefined).bytesOf("support", "writer", {
      runId: "run_1",
      version: null,
    });
    expect(decode(bytes)).toBe("id: writer\nname: Saved\n");
  });
});
