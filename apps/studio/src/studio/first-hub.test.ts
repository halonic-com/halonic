import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { WorkspaceAgents } from "../agents/workspace-agents.ts";
import { WorkspaceWorkflows } from "../workflows/workspace-workflows.ts";
import { hubFilesFor } from "./first-hub.ts";

/** A folder with a `workspace.yaml` and the files given, and the changes made to it, as the kernel's files keep them. */
function folderWith(files: Record<string, string> = {}) {
  const store: Record<string, string> = { "workspace.yaml": "id: acme\nname: Acme\n", ...files };
  const changes: Record<string, string | null>[] = [];
  return {
    store,
    changes,
    files: {
      read: async (path: string) => store[path] ?? null,
      list: async (dir: string) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
      change: (_label: string, made: Record<string, string | null>) => {
        changes.push(made);
        for (const [path, text] of Object.entries(made)) {
          if (text === null) delete store[path];
          else store[path] = text;
        }
      },
      undo: () => false,
      step: 0,
    },
    onChange: () => () => undefined,
    runs: { list: async () => [], subscribe: () => () => undefined, log: async () => [] },
  };
}

verifies("studio.first-hub", () => {
  describe("hubFilesFor", () => {
    it("adds nothing for a hub the workspace has", () => {
      expect(hubFilesFor([{ id: "acme" }], "acme")).toEqual({});
    });

    it("adds the Default hub's file when the workspace has no hub", () => {
      expect(hubFilesFor([], "default")).toEqual({
        "hubs/default/hub.yaml": "id: default\nname: Default\n",
      });
    });

    it("refuses any other hub the workspace doesn't have", () => {
      expect(() => hubFilesFor([], "acme")).toThrow(expect.objectContaining({ kind: "not_found" }));
      expect(() => hubFilesFor([{ id: "acme" }], "default")).toThrow(
        expect.objectContaining({ kind: "not_found" }),
      );
    });
  });

  describe("a folder with no hub", () => {
    it("gets the Default hub with its first agent, in one change", async () => {
      const folder = folderWith();
      const host = new WorkspaceAgents(folder);

      const ref = await host.create({ name: "Greeter", hubId: "default" });

      expect(ref).toEqual({ hubId: "default", id: "greeter" });
      expect(folder.changes).toHaveLength(1);
      expect(Object.keys(folder.changes[0] ?? {})).toEqual([
        "hubs/default/hub.yaml",
        "hubs/default/agents/greeter.agent.yaml",
      ]);
      expect((await host.list()).map((agent) => agent.id)).toEqual(["greeter"]);
      expect(host.hubs()).toEqual([{ id: "default", name: "Default" }]);
    });

    it("gets the Default hub with its first workflow, in one change", async () => {
      const folder = folderWith();
      const host = new WorkspaceWorkflows(folder);

      const ref = await host.create({ name: "Daily summary", hubId: "default" });

      expect(ref).toEqual({ hubId: "default", id: "daily-summary" });
      expect(folder.changes).toHaveLength(1);
      expect(Object.keys(folder.changes[0] ?? {})).toEqual([
        "hubs/default/hub.yaml",
        "hubs/default/workflows/daily-summary.workflow.yaml",
      ]);
      expect((await host.list()).map((workflow) => workflow.id)).toEqual(["daily-summary"]);
    });

    it("refuses another hub and writes nothing", async () => {
      const folder = folderWith();
      await expect(
        new WorkspaceAgents(folder).create({ name: "Lost", hubId: "acme" }),
      ).rejects.toMatchObject({ kind: "not_found" });
      await expect(
        new WorkspaceWorkflows(folder).create({ name: "Lost", hubId: "acme" }),
      ).rejects.toMatchObject({ kind: "not_found" });
      expect(folder.changes).toEqual([]);
    });
  });

  it("leaves a folder that has a hub as it is: no Default hub", async () => {
    const folder = folderWith({ "hubs/acme/hub.yaml": "id: acme\nname: Acme\n" });
    const host = new WorkspaceAgents(folder);

    await host.create({ name: "Greeter", hubId: "acme" });
    await expect(host.create({ name: "Other", hubId: "default" })).rejects.toMatchObject({
      kind: "not_found",
    });

    expect(folder.store["hubs/default/hub.yaml"]).toBeUndefined();
  });
});
