import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceFilesHost } from "./workspace-files-host.ts";

function setup(
  saved: string[] | Error,
  pending: Record<string, string | null> = {},
  more: Record<string, string> = {},
  outside: { held?: string[]; theirs?: string | null } = {},
) {
  const watching: {
    changed?: (changes: { path: string; kind: "changed" | "removed" }[]) => void;
    closed: number;
  } = { closed: 0 };
  const settled: string[] = [];
  const texts: Record<string, string> = { "workspace.yaml": "id: acme\nname: Acme\n", ...more };
  const listeners = new Set<() => void>();
  const changes: { label: string; changes: Record<string, string | null>; key?: string }[] = [];
  const host = new WorkspaceFilesHost({
    store: {
      list: async () => {
        if (saved instanceof Error) throw saved;
        return saved;
      },
      watch: async (listener) => {
        watching.changed = listener.changed;
        return {
          close: async () => {
            watching.closed++;
          },
        };
      },
    },
    files: {
      pending,
      reloadFromOutside: async () => ({ held: outside.held ?? [] }),
      compare: async (path) => ({
        path,
        mine: "mine",
        theirs: outside.theirs === undefined ? "theirs" : outside.theirs,
        combined: null,
      }),
      settle: async (path) => {
        settled.push(path);
      },
      read: async (path) => (path in pending ? (pending[path] ?? null) : (texts[path] ?? null)),
      list: async (dir) => Object.keys(texts).filter((path) => path.startsWith(`${dir}/`)),
      change: (label, made, options) => {
        changes.push({
          label,
          changes: made,
          ...(options?.coalesceKey ? { key: options.coalesceKey } : {}),
        });
      },
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { host, listeners, changes, watching, settled };
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

  it("reads a file with its unsaved text, and null when it has none", async () => {
    const { host } = setup([], { "a.md": "unsaved" });

    expect(await host.read("a.md")).toBe("unsaved");
    expect(await host.read("b.md")).toBeNull();
  });

  it("records an edit as one undo step per file", () => {
    const { host, changes } = setup([]);

    host.edit("a.md", "hello");

    expect(changes).toEqual([{ label: "Edited a.md", changes: { "a.md": "hello" }, key: "a.md" }]);
  });

  it("reports a file's errors by path and counts them in the listing's marks", async () => {
    const { host } = setup(["hubs/p/hub.yaml"], {}, { "hubs/p/hub.yaml": "id: [unclosed\n" });

    const problems = await host.problems();
    const listing = await host.list();

    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toMatchObject({ file: "hubs/p/hub.yaml", severity: "error" });
    expect(problems[0]?.line).toBeGreaterThan(0);
    expect(listing.marks.get("hubs/p/hub.yaml")?.errors).toBeGreaterThan(0);
  });

  it("reports no problems for a workspace without any", async () => {
    const { host } = setup(["notes.md"], { "notes.md": "hi" });

    expect(await host.problems()).toEqual([]);
  });

  it("marks a file with unsaved changes that changed outside, and tells a subscriber", async () => {
    const { host, watching } = setup(["a.md"], { "a.md": "mine" }, {}, { held: ["a.md"] });
    let told = 0;
    host.subscribe(() => told++);

    watching.changed?.([{ path: "a.md", kind: "changed" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.outside().get("a.md")).toBe("changed");
    expect((await host.list()).marks.get("a.md")?.outside).toBe(true);
    expect(told).toBe(1);
  });

  it("holds a file that is gone from the folder as deleted", async () => {
    const { host, watching } = setup(
      ["a.md"],
      { "a.md": "mine" },
      {},
      { held: ["a.md"], theirs: null },
    );

    watching.changed?.([{ path: "a.md", kind: "removed" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(host.outside().get("a.md")).toBe("deleted");
  });

  it("stops holding a file once the user settles it", async () => {
    const { host, watching, settled } = setup(
      ["a.md"],
      { "a.md": "mine" },
      {},
      { held: ["a.md"] },
    );
    watching.changed?.([{ path: "a.md", kind: "changed" }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    let told = 0;
    host.subscribe(() => told++);

    await host.settle("a.md", "use-other");

    expect(settled).toEqual(["a.md"]);
    expect(host.outside().size).toBe(0);
    expect(told).toBe(1);
  });

  it("closes the watch when disposed", async () => {
    const { host, watching } = setup([]);

    await host.dispose();
    await host.dispose();

    expect(watching.closed).toBe(1);
  });
});
