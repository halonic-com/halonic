import { errorKindOf, KindedError } from "@halonicjs/std";
import { folderReaderContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakePluginFolderShell } from "./fake-plugin-folder-shell.test-helper.ts";
import { TauriPluginFolderReader } from "./plugin-folder-reader.ts";
import { TauriPluginFolderWriter } from "./plugin-folder-writer.ts";
import type { TauriShell } from "./shell.ts";

const acmeFiles = { "acme-weather/plugin.yaml": "id: acme-weather\n" };

// The contract runs against the fake shell. That the shell reads real files
// as the CLI's reader does, never through a link, is proved by the Rust
// tests of the plugin_folder commands.
folderReaderContract(
  "tauri plugins",
  async (tree) => new TauriPluginFolderReader(new FakePluginFolderShell({ tree })),
  { specialFiles: true },
);

async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.plugin-folder", () => {
  describe("TauriPluginFolderReader", () => {
    it("names no folder in any call", async () => {
      const shell = new FakePluginFolderShell({ tree: { files: acmeFiles } });
      const reader = new TauriPluginFolderReader(shell);
      await reader.entries("acme-weather", { limit: 2, recursive: false });
      expect(
        new TextDecoder().decode((await reader.read("acme-weather/plugin.yaml")) ?? undefined),
      ).toBe("id: acme-weather\n");
      await reader.locationOf();
      expect(shell.calls.map((call) => call.command)).toEqual([
        "plugin_folder_entries",
        "plugin_folder_read",
        "plugin_folder_location",
      ]);
      expect(shell.calls[0]?.args).toEqual({ dir: "acme-weather", limit: 2, recursive: false });
    });

    it("refuses an unsafe path before it calls the shell", async () => {
      const shell = new FakePluginFolderShell({ tree: { files: acmeFiles } });
      const reader = new TauriPluginFolderReader(shell);
      expect(await rejection(reader.read("../profile/secret"))).toBeInstanceOf(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("rejects with an unavailable error that drops the text of a page without the capability", async () => {
      const shell = new FakePluginFolderShell({ tree: { files: acmeFiles }, granted: false });
      const error = await rejection(new TauriPluginFolderReader(shell).entries());
      expect(errorKindOf(error)).toBe("unavailable");
      expect(String(error)).not.toContain("ACL");
    });
  });

  describe("refusals", () => {
    /** A shell that refuses every call with `kind`, as the Rust commands do. */
    function refusing(kind: string): TauriShell {
      return {
        invoke: () => Promise.reject({ kind, message: `refused with ${kind}` }),
      };
    }

    it("maps an unreadable folder and an io failure to unavailable", async () => {
      for (const kind of ["folder_unreadable", "io"]) {
        const error = await rejection(new TauriPluginFolderReader(refusing(kind)).entries());
        expect(errorKindOf(error)).toBe("unavailable");
      }
    });

    it("maps a special file the shell refuses to remove to a RangeError", async () => {
      const error = await rejection(
        new TauriPluginFolderWriter(refusing("special_path")).remove("acme-weather"),
      );
      expect(error).toBeInstanceOf(RangeError);
    });
  });

  describe("the fake shell", () => {
    it("refuses what the Rust commands refuse, so the adapter's mapping is tested against it", async () => {
      const shell = new FakePluginFolderShell({ tree: { files: acmeFiles }, granted: true });
      expect(
        await rejection(shell.invoke("plugin_folder_remove", { plugin: "../x" })),
      ).toMatchObject({ kind: "unsafe_path" });
      expect(await rejection(shell.invoke("plugin_folder_read", { path: "../x" }))).toMatchObject({
        kind: "unsafe_path",
      });
      expect(await rejection(shell.invoke("plugin_folder_nope"))).toContain("not found");
    });
  });

  describe("TauriPluginFolderWriter", () => {
    it("removes a plugin by its name, and a missing one without error", async () => {
      const shell = new FakePluginFolderShell({ tree: { files: acmeFiles } });
      const writer = new TauriPluginFolderWriter(shell);
      await writer.remove("acme-weather");
      await writer.remove("acme-weather");
      expect(shell.plugins).toEqual([]);
      expect(shell.calls.map((call) => call.args)).toEqual([
        { plugin: "acme-weather" },
        { plugin: "acme-weather" },
      ]);
    });

    it("refuses an unsafe name before it calls the shell", async () => {
      const shell = new FakePluginFolderShell({ tree: { files: acmeFiles } });
      const writer = new TauriPluginFolderWriter(shell);
      for (const id of ["", ".", "..", "a/b", "a\\b", "acme-weather.", "con"]) {
        expect(await rejection(writer.remove(id))).toBeInstanceOf(RangeError);
      }
      expect(shell.calls).toEqual([]);
    });

    it("rejects, and does not throw, for an unsafe id to place", async () => {
      const writer = new TauriPluginFolderWriter(new FakePluginFolderShell({ tree: {} }));
      const placing = writer.place("..", new Map(), { replace: false });
      expect(await rejection(placing)).toBeInstanceOf(RangeError);
    });

    it("refuses to place a plugin: adding one is a CLI action", async () => {
      const shell = new FakePluginFolderShell({ tree: {} });
      const error = await rejection(
        new TauriPluginFolderWriter(shell).place("acme-weather", new Map(), { replace: false }),
      );
      expect(error).toBeInstanceOf(KindedError);
      expect((error as Error).message).toContain("halonic plugin add");
      expect(shell.calls).toEqual([]);
    });
  });
});
