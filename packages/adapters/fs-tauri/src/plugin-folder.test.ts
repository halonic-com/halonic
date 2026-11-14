import { errorKindOf, KindedError } from "@halonicjs/std";
import { folderReaderContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakePluginFolderShell } from "./fake-plugin-folder-shell.test-helper.ts";
import { TauriPluginFolderReader } from "./plugin-folder-reader.ts";
import { TauriPluginFolderWriter } from "./plugin-folder-writer.ts";

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
