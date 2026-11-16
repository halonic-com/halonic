import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceFilesHost } from "./workspace-files-host.ts";

function setup(saved: string[] | Error, pending: Record<string, string | null> = {}) {
  const listeners = new Set<() => void>();
  const host = new WorkspaceFilesHost({
    store: {
      list: async () => {
        if (saved instanceof Error) throw saved;
        return saved;
      },
    },
    files: { pending },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { host, listeners };
}

verifies("studio.workspace-files-host", () => {
  it("lists saved files and an unsaved new file together", async () => {
    const { host } = setup(["workspace.yaml", "hubs/p/hub.yaml"], { "notes.md": "hi" });

    const listing = await host.list();

    expect(listing.paths).toEqual(["hubs/p/hub.yaml", "notes.md", "workspace.yaml"]);
    expect(listing.marks.size).toBe(0);
  });

  it("leaves out an unsaved delete", async () => {
    const { host } = setup(["workspace.yaml", "a.md"], { "workspace.yaml": null });

    expect((await host.list()).paths).toEqual(["a.md"]);
  });

  it("tells a subscriber of a change, and not after it unsubscribes", () => {
    const { host, listeners } = setup([]);
    let told = 0;

    const stop = host.subscribe(() => told++);
    for (const listener of listeners) listener();
    stop();

    expect(told).toBe(1);
    expect(listeners.size).toBe(0);
  });

  it("rejects an unreadable folder with a one-sentence reason", async () => {
    const { host } = setup(new Error("The folder hubs can't be read"));

    await expect(host.list()).rejects.toThrow("The folder hubs can't be read.");
  });
});
