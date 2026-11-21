import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { EventBus, type WorkspaceScope } from "@halonicjs/app";
import type { ChangesRead } from "@halonicjs/studio-feature-source-control/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { folderLiveness } from "./folder-liveness.ts";

verifies("studio.workspace-liveness", () => {
  it("tells a page to read again when a file is saved or changes, or a version is made", async () => {
    const events: WorkspaceScope["events"] = new EventBus();
    const versionListeners = new Set<() => void>();
    const noRepository: ChangesRead = { kind: "not-a-repository" };
    const { liveness, onChange } = folderLiveness({
      changes: {
        read: async () => noRepository,
        readTexts: async () => ({ before: null, after: null }),
        readHistory: async () => [],
        onNewVersion: (listener) => {
          versionListeners.add(listener);
          return () => versionListeners.delete(listener);
        },
      },
      saved: new MemoryDefinitionStore(),
      events,
    });
    let reads = 0;
    const stop = onChange(() => reads++);
    events.emit("files.saved", { paths: ["hubs/acme/agents/sorter.agent.yaml"] });
    events.emit("files.changed", { pending: {}, label: "Edit Sorter" });
    for (const listener of versionListeners) listener();
    expect(reads).toBe(3);

    stop();
    events.emit("files.saved", { paths: [] });
    expect(reads).toBe(3);
    expect(versionListeners.size).toBe(0);
    expect(await liveness.liveState("hubs/acme/agents/sorter.agent.yaml")).toEqual({
      state: "live",
    });
  });
});
