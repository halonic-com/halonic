import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { sampleHostOf } from "./sample-host.ts";

/** A shell where the folders in `taken` are there already. */
function hostOf(taken: string[], answers: Record<string, unknown> = {}) {
  const store = new MemoryDefinitionStore();
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const shell = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      const answer = answers[command];
      if (typeof answer === "object" && answer !== null && "reject" in answer) throw answer.reject;
      if (command === "documents_folder") return "/docs/Documents";
      if (command === "probe_workspace_folder")
        return taken.includes(String(args?.["name"])) ? "files" : "new";
      if (command === "create_workspace_folder" && !Object.hasOwn(answers, command))
        return `${args?.["parent"]}/${args?.["name"]}`;
      return answer;
    },
    openChannel: () => {
      throw new Error("no channel");
    },
  };
  const trust = vi.fn(async () => undefined);
  const host = sampleHostOf({ shell, storeOf: () => store, trust, separator: "/" });
  return { host, store, trust, calls };
}

verifies("studio.try-sample", () => {
  it("copies the example into Acme sample and trusts it", async () => {
    const { host, store, trust } = hostOf([]);

    expect(await host.create([])).toEqual({
      kind: "created",
      folder: "/docs/Documents/Acme sample",
      name: "Acme sample",
      trust: { kind: "trusted" },
    });
    const files = await store.list();
    expect(files).toContain("workspace.yaml");
    expect(files).toContain("hubs/support/hub.yaml");
    expect(trust).toHaveBeenCalledWith("/docs/Documents/Acme sample");
  });

  it("never writes into a folder that is there: it takes the next free name", async () => {
    const { host, calls } = hostOf(["Acme sample", "Acme sample 2"]);

    const made = await host.create([]);

    expect(made).toMatchObject({ kind: "created", name: "Acme sample 3" });
    expect(calls.filter(([command]) => command === "create_workspace_folder")).toEqual([
      ["create_workspace_folder", { parent: "/docs/Documents", name: "Acme sample 3" }],
    ]);
  });

  it("says where and why when the shell refuses, and trusts nothing", async () => {
    const { host, store, trust } = hostOf([], {
      create_workspace_folder: { reject: { kind: "parent_private" } },
    });

    expect(await host.create([])).toEqual({
      kind: "cant",
      folder: "~/Documents",
      reason: "Halonic keeps its own files there",
    });
    expect(await store.list()).toEqual([]);
    expect(trust).not.toHaveBeenCalled();
  });

  it("marks a shell that gives no answer, so Welcome words it itself", async () => {
    const { host } = hostOf([], { create_workspace_folder: null });

    expect(await host.create([])).toEqual({
      kind: "cant",
      folder: "~/Documents",
      reason: "the desktop shell gave no answer",
      unavailable: true,
    });
  });

  it("doesn't mark a failure after the folder is made, so Welcome never makes a second copy", async () => {
    const { host, trust } = hostOf([]);
    trust.mockRejectedValueOnce(new KindedError("unavailable", "the shell gave no answer"));

    expect(await host.create([])).not.toHaveProperty("unavailable");
  });

  it("reopens the first taken name when the device knows it as a sample, and writes nothing", async () => {
    const { host, store, trust, calls } = hostOf(["Acme sample"]);

    expect(await host.create(["/docs/Documents/Acme sample"])).toEqual({
      kind: "existing",
      folder: "/docs/Documents/Acme sample",
    });
    expect(await store.list()).toEqual([]);
    expect(trust).not.toHaveBeenCalled();
    expect(calls.some(([command]) => command === "create_workspace_folder")).toBe(false);
  });

  it("passes by a taken folder it doesn't know, then reopens a known later copy", async () => {
    const { host } = hostOf(["Acme sample", "Acme sample 2"]);

    expect(await host.create(["/docs/Documents/Acme sample 2"])).toEqual({
      kind: "existing",
      folder: "/docs/Documents/Acme sample 2",
    });
  });
});
