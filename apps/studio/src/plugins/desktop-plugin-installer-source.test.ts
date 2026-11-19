import type { TauriShell } from "@halonicjs/adapter-fs-tauri";
import {
  MemoryFolderReader,
  MemoryPluginFolder,
  MemoryRecordStore,
  MemoryTrustStore,
} from "@halonicjs/adapter-memory";
import { PluginService, TrustService } from "@halonicjs/app";
import { encodeBase64url } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { digest } from "./acme-plugins.testing.ts";
import { desktopPluginInstaller } from "./desktop-plugin-installer.ts";

const weatherManifest = `id: weather
version: 1.0.0
sdk: 1
name: Weather
backend:
  hosts: [api.acme.example]
  tools:
    - { name: forecast, description: The forecast., risk: read, untrusted: true }
`;

const picked = "pick:weather";

/**
 * A shell that reads the folder `picked` through the source commands, as the Rust shell does,
 * and refuses any other location as `source_not_picked`. The installer's real
 * `TauriPluginSourceReader` reads it, so a call the reader gets wrong fails here (HAL-12448).
 */
function sourceShell(): TauriShell {
  const source = new MemoryFolderReader(picked);
  source.putFile("plugin.yaml", weatherManifest);
  source.putFile("backend/index.js", "export default {};\n");
  return {
    async invoke(command, args = {}) {
      if (args["source"] !== picked) {
        throw {
          kind: "source_not_picked",
          message: "A plugin can only be added from a folder chosen with Choose folder….",
        };
      }
      if (command === "plugin_source_entries") {
        const dir = args["dir"];
        return await source.entries(typeof dir === "string" ? dir : undefined, {
          recursive: args["recursive"] !== false,
        });
      }
      if (command === "plugin_source_read") {
        const bytes = await source.read(String(args["path"]));
        return bytes === null ? null : encodeBase64url(bytes);
      }
      throw new Error(`the shell has no command ${command}`);
    },
  };
}

/** The installer over core's own `PluginService`, with the plugins folder in memory. */
function installer(installed: Record<string, string> = {}) {
  const folder = new MemoryPluginFolder();
  for (const [path, text] of Object.entries(installed)) folder.reader.putFile(path, text);
  const clock = { now: () => new Date("2026-11-18T09:00:00.000Z") };
  const service = new PluginService({
    plugins: folder.reader,
    writer: folder,
    digest,
    trust: new TrustService({ store: new MemoryTrustStore(), digest, clock, appVersion: "0.1.0" }),
    records: new MemoryRecordStore(),
    clock,
  });
  const reloads: unknown[] = [];
  const add = desktopPluginInstaller({
    ipc: sourceShell(),
    service,
    reload: async () => {
      reloads.push("reload");
    },
    onReloadFailed: (error) => reloads.push(error),
  });
  return { add, folder, reloads };
}

const never = new AbortController().signal;

verifies("studio.desktop-plugin-installer", () => {
  describe("over the shell's source reader and core's PluginService", () => {
    it("adds a valid plugin from the picked folder, so its trust check can open", async () => {
      const { add, folder, reloads } = installer();
      const outcome = await add.add({ kind: "folder", path: picked }, never);
      expect(outcome).toEqual({ kind: "added", plugin: "weather" });
      expect(await folder.reader.read("weather/plugin.yaml")).not.toBeNull();
      expect(reloads).toEqual(["reload"]);
    });

    it("says not-picked for a path the person typed, and writes nothing", async () => {
      const { add, folder } = installer();
      const outcome = await add.add({ kind: "folder", path: "/somewhere/typed/weather" }, never);
      expect(outcome).toEqual({ kind: "not-picked" });
      expect(await folder.reader.entries()).toEqual([]);
    });

    it("says taken with the plugin's id and its name when the id is in use", async () => {
      const { add } = installer({ "weather/plugin.yaml": "id: weather\n" });
      const outcome = await add.add({ kind: "folder", path: picked }, never);
      expect(outcome).toEqual({ kind: "taken", plugin: "weather", name: "Weather" });
    });
  });
});
