import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { newWorkspaceHostOf, reasonOf } from "./new-workspace-host.ts";

function shellOf(answers: Record<string, unknown>) {
  const calls: Array<[string, unknown]> = [];
  const shell = {
    invoke: async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      const answer = answers[command];
      if (typeof answer === "object" && answer !== null && "reject" in answer) throw answer.reject;
      if (typeof answer === "function") return answer(args);
      return answer;
    },
    openChannel: () => {
      throw new Error("no channel");
    },
  };
  return { shell, calls };
}

function hostOf(answers: Record<string, unknown>, trust = vi.fn(async () => undefined)) {
  const store = new MemoryDefinitionStore();
  const { shell, calls } = shellOf(answers);
  const host = newWorkspaceHostOf({ shell, storeOf: () => store, trust, separator: "/" });
  return { host, store, calls, trust };
}

verifies("studio.new-workspace", () => {
  it("starts in Documents and picks a parent through the shell", async () => {
    const { host } = hostOf({ documents_folder: "/docs/Documents", pick_parent_folder: "/work" });
    expect(await host.defaultParent()).toBe("/docs/Documents");
    expect(await host.pickParent?.()).toBe("/work");
    expect(host.folderOf("/work", "Acme")).toBe("/work/Acme");
    expect(host.folderOf("/", "Acme")).toBe("/Acme");
  });

  it("says no parent was picked when the dialog is cancelled", async () => {
    const { host } = hostOf({ pick_parent_folder: null });
    expect(await host.pickParent?.()).toBeUndefined();
  });

  it("makes the folder, lays the workspace out and trusts it", async () => {
    const { host, store, calls, trust } = hostOf({
      create_workspace_folder: (args: { parent: string; name: string }) =>
        `${args.parent}/${args.name}`,
    });
    const result = await host.create("/work/Acme Support", "Acme Support");
    expect(result).toEqual({ kind: "trusted" });
    expect(calls[0]).toEqual([
      "create_workspace_folder",
      { parent: "/work", name: "Acme Support" },
    ]);
    expect((await store.list()).sort()).toEqual([".gitignore", "workspace.yaml"]);
    expect(trust).toHaveBeenCalledWith("/work/Acme Support");
  });

  it("still creates the workspace when the trust record can't be saved", async () => {
    const { host, store } = hostOf(
      { create_workspace_folder: "/work/Acme" },
      vi.fn(async () => {
        throw new Error("disk full");
      }),
    );
    expect(await host.create("/work/Acme", "Acme")).toEqual({
      kind: "not-saved",
      reason: "disk full",
    });
    expect(await store.list()).toContain("workspace.yaml");
  });

  it("writes nothing and says why when the folder is already there", async () => {
    const { host, store, trust } = hostOf({
      create_workspace_folder: { reject: { kind: "exists", message: "x" } },
    });
    await expect(host.create("/work/Acme", "Acme")).rejects.toThrow(
      "a folder with that name is already there",
    );
    expect(await store.list()).toEqual([]);
    expect(trust).not.toHaveBeenCalled();
  });

  it("words the shell's refusals", () => {
    expect(reasonOf({ kind: "parent_not_chosen" })).toBe("that isn't a folder you chose");
    expect(reasonOf({ kind: "name_invalid", reason: "empty" })).toBe("the name is empty");
    expect(reasonOf({ kind: "io" })).toBe("you don't have permission");
    expect(reasonOf("nope")).toBe("the desktop shell refused");
  });
});
