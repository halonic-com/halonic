import { rm } from "node:fs/promises";
import { join } from "node:path";
import { LocalToolSettingsNotSetError, LocalToolUnavailableError } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FakeLocalTools,
  makePluginsFolder,
  onlyLocalTool,
  pluginsFolder,
  put,
  refusedWith,
  removePluginsFolder,
  setup,
  withLocalTool,
} from "./host-plugin-backends.test-helper.ts";
import { PluginRefusal } from "./plugin-refusal.ts";
import { PluginTable } from "./plugin-table.ts";

beforeEach(makePluginsFolder);
afterEach(removePluginsFolder);

verifies("agent-host.plugin-local-tools", () => {
  describe("a plugin with a local tool", () => {
    beforeEach(async () => {
      await put({
        "acme/plugin.yaml": withLocalTool,
        "acme/tools/server.js": "console.log('lister');\n",
      });
    });

    it("sends each call to the part that declares the tool, under the checked trust", async () => {
      const local = new FakeLocalTools();
      const { backends, seen } = await setup({ localTools: local.source });
      const fingerprint = await backends.trustedFingerprint("acme");
      const client = await backends.open("acme", fingerprint);
      expect(await client.callTool("list-files", {})).toBe("local answer from list-files");
      expect(await client.callTool("echo", {})).toBe("answer from echo");
      expect(local.sets.map((set) => [set.part, set.trust.fingerprint])).toEqual([
        ["local:lister", fingerprint],
      ]);
      await client.close();
      expect(seen).toEqual({ starts: 1, stops: 1 });
    });

    it("answers not_fenced for a local tool this computer can't fence, and the backend still answers", async () => {
      const local = new FakeLocalTools();
      local.startError = new LocalToolUnavailableError("acme:lister", {
        kind: "sandbox-unavailable",
        reason: "container",
      });
      const { backends, logged } = await setup({ localTools: local.source });
      const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
      expect(await refusedWith(client.callTool("list-files", {}))).toBe("not_fenced");
      expect(await client.callTool("echo", {})).toBe("answer from echo");
      expect(logged).toEqual([
        "A part of the plugin acme can't start (local:lister): sandbox-unavailable.\n",
      ]);
    });

    it("refuses nothing for a setting with no value, so the call fails and the log names the code", async () => {
      const local = new FakeLocalTools();
      local.startError = new LocalToolSettingsNotSetError("acme:lister", ["root"]);
      const { backends, logged } = await setup({ localTools: local.source });
      const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
      const failed = await client.callTool("list-files", {}).catch((error: unknown) => error);
      expect(failed).not.toBeInstanceOf(PluginRefusal);
      expect(logged.join("")).toContain("(local:lister): settings-not-set.");
    });

    describe("through the plugin table, a local tool that can't start leaves the backend's runner running", () => {
      it.each([
        [
          "not_fenced",
          new LocalToolUnavailableError("acme:lister", {
            kind: "sandbox-unavailable",
            reason: "container",
          }),
        ],
        ["settings-not-set", new LocalToolSettingsNotSetError("acme:lister", ["root"])],
      ])("for %s", async (_code, startError) => {
        const local = new FakeLocalTools();
        local.startError = startError;
        const { backends, seen } = await setup({ localTools: local.source });
        const table = new PluginTable(backends);
        expect(await table.call("acme", "echo", {})).toBe("answer from echo");
        await expect(table.call("acme", "list-files", {})).rejects.toThrow();
        expect(await table.call("acme", "echo", {})).toBe("answer from echo");
        expect(seen).toEqual({ starts: 1, stops: 0 });
        await table.closeAll();
      });

      it("but a plugin the trust no longer covers stops whole", async () => {
        const local = new FakeLocalTools();
        const { backends, seen } = await setup({ localTools: local.source });
        const table = new PluginTable(backends);
        expect(await table.call("acme", "echo", {})).toBe("answer from echo");
        await put({ "acme/tools/server.js": "console.log('swapped');\n" });
        expect(await refusedWith(table.call("acme", "list-files", {}))).toBe("plugin_not_trusted");
        expect(seen).toEqual({ starts: 1, stops: 1 });
      });
    });

    it("refuses to open for a fingerprint the folder no longer has, and starts no part", async () => {
      const local = new FakeLocalTools();
      const { backends, seen } = await setup({ localTools: local.source });
      const fingerprint = await backends.trustedFingerprint("acme");
      await put({ "acme/tools/server.js": "console.log('swapped');\n" });
      expect(await refusedWith(backends.open("acme", fingerprint))).toBe("plugin_not_trusted");
      expect({ starts: seen.starts, sets: local.sets.length }).toEqual({ starts: 0, sets: 0 });
    });
  });

  describe("a plugin whose only part is a local tool", () => {
    it("is trusted and callable, with no backend started", async () => {
      await rm(join(pluginsFolder(), "acme"), { recursive: true, force: true });
      await put({
        "acme/plugin.yaml": onlyLocalTool,
        "acme/tools/server.js": "console.log('lister');\n",
      });
      const local = new FakeLocalTools();
      const { backends, seen } = await setup({ localTools: local.source });
      const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
      expect(await client.callTool("list-files", {})).toBe("local answer from list-files");
      expect(seen.starts).toBe(0);
    });
  });
});
