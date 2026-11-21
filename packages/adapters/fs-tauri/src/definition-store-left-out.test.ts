import { definitionSourceLeftOutContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { TauriDefinitionStore } from "./definition-store.ts";
import { FakeFileShell } from "./fake-file-shell.test-helper.ts";

const acme = "/workspaces/acme";

// The contract runs against the fake shell; the Rust tests of `fs_list` in
// apps/studio/src-tauri prove the walk on real files (requirement
// `studio.src-tauri.crates.workspace-files.left-out`).
definitionSourceLeftOutContract(
  "tauri",
  async (files) => new TauriDefinitionStore(new FakeFileShell({ opened: [acme], files }), acme),
);

verifies("fs-tauri.definition-store-left-out", () => {
  it("sends leaveOut to the shell only when it is given", async () => {
    const shell = new FakeFileShell({ opened: [acme], files: { "workspace.yaml": "id: acme\n" } });
    const store = new TauriDefinitionStore(shell, acme);
    const leaveOut = { folders: ["repo"], names: ["node_modules"] };
    await store.list(undefined, { leaveOut });
    await store.list();
    expect(shell.calls).toEqual([
      { command: "fs_list", args: { workspace: acme, dir: null, leaveOut } },
      { command: "fs_list", args: { workspace: acme, dir: null } },
    ]);
  });

  it("gives nothing for a left-out folder without calling the shell", async () => {
    const shell = new FakeFileShell({ opened: [acme], files: { "repo/a.ts": "a\n" } });
    const store = new TauriDefinitionStore(shell, acme);
    expect(await store.list("repo", { leaveOut: { folders: ["REPO"] } })).toEqual([]);
    expect(shell.calls).toEqual([]);
  });

  it("refuses a leaveOut that could reach further than it says", async () => {
    const shell = new FakeFileShell({ opened: [acme], files: {} });
    const store = new TauriDefinitionStore(shell, acme);
    await expect(store.list(undefined, { leaveOut: { folders: ["a/../b"] } })).rejects.toThrow(
      RangeError,
    );
    expect(shell.calls).toEqual([]);
  });

  it("gives the version of the files it lists, as the memory store works it out", async () => {
    const listed = { "workspace.yaml": "id: a\n" };
    const files = { ...listed, "repo/a.ts": "a\n", "node_modules/x.js": "x\n" };
    const leaveOut = { folders: ["repo"], names: ["node_modules"] };
    const withLeftOut = new TauriDefinitionStore(
      new FakeFileShell({ opened: [acme], files }),
      acme,
    );
    const onlyListed = new TauriDefinitionStore(
      new FakeFileShell({ opened: [acme], files: listed }),
      acme,
    );
    expect(await withLeftOut.version({ leaveOut })).toBe(await onlyListed.version());
  });
});
