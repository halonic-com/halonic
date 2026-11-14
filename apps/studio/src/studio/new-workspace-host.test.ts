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
  const { shell, calls } = shellOf({ probe_workspace_folder: "new", ...answers });
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
    expect(calls[1]).toEqual([
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

  it("sends the shell the parent that was picked, a drive or filesystem root included", async () => {
    const cases: Array<["/" | "\\", string]> = [
      ["/", "/"],
      ["/", "/work"],
      ["\\", "D:\\"], // leak-guard: allow absolute-path a Windows drive root is the case under test
      ["\\", "D:\\Work"], // leak-guard: allow absolute-path a Windows drive root is the case under test
    ];
    for (const [separator, parent] of cases) {
      const { shell, calls } = shellOf({ create_workspace_folder: "made" });
      const host = newWorkspaceHostOf({
        shell,
        storeOf: () => new MemoryDefinitionStore(),
        trust: async () => undefined,
        separator,
      });
      await host.create(host.folderOf(parent, "Acme"), "Acme");
      expect(calls[1]).toEqual(["create_workspace_folder", { parent, name: "Acme" }]);
    }
  });

  it("words the shell's refusals", () => {
    expect(reasonOf({ kind: "parent_not_chosen" })).toBe("that isn't a folder you chose");
    expect(reasonOf({ kind: "name_invalid", reason: "empty" })).toBe("the name is empty");
    expect(reasonOf({ kind: "io", message: "Permission denied (os error 13)" })).toBe(
      "Permission denied (os error 13)",
    );
    expect(reasonOf({ kind: "io" })).toBe("the desktop shell refused");
    expect(reasonOf("nope")).toBe("the desktop shell refused");
  });

  it("probes a folder by name and shows an empty one like a new one", async () => {
    const answers = ["new", "empty", "files", "workspace"];
    const { host, calls } = hostOf({ probe_workspace_folder: () => answers.shift() });
    expect(await host.probe("/work/Acme")).toBe("new");
    expect(await host.probe("/work/Acme")).toBe("new");
    expect(await host.probe("/work/Acme")).toBe("not-empty");
    expect(await host.probe("/work/Acme")).toBe("workspace");
    expect(calls[0]).toEqual(["probe_workspace_folder", { parent: "/work", name: "Acme" }]);
    expect((await hostOf({}).host.probe("/Acme")) satisfies string).toBe("new");
  });

  it("opens a workspace that is there only through the shell's question", async () => {
    const { host, calls } = hostOf({ open_workspace_folder: "/work/Acme" });
    expect(await host.open?.("/work/Acme")).toBe("/work/Acme");
    expect(calls[0]).toEqual(["open_workspace_folder", { parent: "/work", name: "Acme" }]);
    const declined = hostOf({ open_workspace_folder: null });
    expect(await declined.host.open?.("/work/Acme")).toBeUndefined();
  });

  it("adds the missing files to a folder with files, after the shell asks, and opens it untrusted", async () => {
    const { host, store, calls, trust } = hostOf({
      probe_workspace_folder: "files",
      open_workspace_folder: "/work/Acme",
    });
    expect(await host.create("/work/Acme", "Acme")).toEqual({ kind: "untrusted" });
    expect(calls.map(([command]) => command)).toEqual([
      "probe_workspace_folder",
      "open_workspace_folder",
    ]);
    expect(await store.list()).toContain("workspace.yaml");
    expect(trust).not.toHaveBeenCalled();
  });

  it("trusts an empty folder at once, since the template wrote everything in it", async () => {
    const { host, store, trust } = hostOf({
      probe_workspace_folder: "empty",
      open_workspace_folder: "/work/Acme",
    });
    expect(await host.create("/work/Acme", "Acme")).toEqual({ kind: "trusted" });
    expect(await store.list()).toContain("workspace.yaml");
    expect(trust).toHaveBeenCalledWith("/work/Acme");
  });

  it("opens a workspace that is already there untrusted and writes nothing", async () => {
    const { host, store, trust } = hostOf({
      probe_workspace_folder: "workspace",
      open_workspace_folder: "/work/Acme",
    });
    expect(await host.create("/work/Acme", "Acme")).toEqual({ kind: "untrusted" });
    expect(await store.list()).toEqual([]);
    expect(trust).not.toHaveBeenCalled();
  });

  it("opens untrusted when the folder became a workspace after the probe", async () => {
    const { host, store, trust } = hostOf({
      probe_workspace_folder: "files",
      open_workspace_folder: "/work/Acme",
    });
    await store.write("workspace.yaml", "id: acme\nname: Acme\n");
    expect(await host.create("/work/Acme", "Acme")).toEqual({ kind: "untrusted" });
    expect(trust).not.toHaveBeenCalled();
  });

  it("writes nothing when the person says no to opening the folder", async () => {
    const { host, store } = hostOf({
      probe_workspace_folder: "empty",
      open_workspace_folder: null,
    });
    expect(await host.create("/work/Acme", "Acme")).toEqual({ kind: "cancelled" });
    expect(await store.list()).toEqual([]);
  });

  it("puts a name problem on the name and the rest on the folder", async () => {
    const name = hostOf({
      probe_workspace_folder: "new",
      create_workspace_folder: { reject: { kind: "name_invalid", reason: "empty" } },
    });
    await expect(name.host.create("/work/Acme", "Acme")).rejects.toMatchObject({ field: "name" });
    const other = hostOf({
      probe_workspace_folder: "new",
      create_workspace_folder: { reject: { kind: "exists" } },
    });
    await expect(other.host.create("/work/Acme", "Acme")).rejects.toMatchObject({
      field: "folder",
    });
  });

  it("says why the shell refused to open the folder", async () => {
    const { host } = hostOf({
      probe_workspace_folder: "files",
      open_workspace_folder: { reject: { kind: "folder_changed", message: "x" } },
    });
    await expect(host.create("/work/Acme", "Acme")).rejects.toThrow(
      "the folder changed while you were asked",
    );
  });
});
