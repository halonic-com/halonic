import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceModelsFiles } from "./workspace-models-files.ts";

function setup() {
  const store: Record<string, string> = { "models.yaml": "version: 1\naliases: {}\n" };
  const changes: { label: string; changes: Record<string, string | null> }[] = [];
  const listeners = new Set<() => void>();
  const models = new WorkspaceModelsFiles({
    files: {
      read: async (path) => store[path] ?? null,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (label, made) => changes.push({ label, changes: made }),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return { store, changes, listeners, models };
}

verifies("models.aliases.edit-target", () => {
  it("reads models.yaml with the workspace's unsaved changes", async () => {
    const { models } = setup();

    expect(await models.readModels()).toBe("version: 1\naliases: {}\n");
  });

  it("reads no file as null", async () => {
    const { store, models } = setup();
    delete store["models.yaml"];

    expect(await models.readModels()).toBeNull();
  });

  it("reads workspace.yaml, or null", async () => {
    const { store, models } = setup();
    store["workspace.yaml"] = "id: acme\n";

    expect(await models.readWorkspace()).toBe("id: acme\n");
  });

  it("changes models.yaml as one named step", () => {
    const { changes, models } = setup();

    models.changeModels("Updated model alias smart", "version: 1\n");

    expect(changes).toEqual([
      { label: "Updated model alias smart", changes: { "models.yaml": "version: 1\n" } },
    ]);
  });

  it("tells a listener about changes until it stops", () => {
    const { listeners, models } = setup();

    const stop = models.subscribe(() => undefined);
    expect(listeners.size).toBe(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});

verifies("models.providers.list-and-show", () => {
  it("reads only the providers/<id>.yaml files, with their paths", async () => {
    const { store, models } = setup();
    store["providers/b.yaml"] = "id: b\n";
    store["providers/a.yaml"] = "id: a\n";
    store["providers/README.md"] = "notes\n";
    store["providers/old/x.yaml"] = "id: x\n";
    store["providers/x.yml"] = "id: x\n";

    expect(await models.readProviders()).toEqual([
      { path: "providers/a.yaml", text: "id: a\n" },
      { path: "providers/b.yaml", text: "id: b\n" },
    ]);
  });
});
