import { RunnerToolError } from "@halonicjs/adapter-integration-runner";
import { MemorySecrets } from "@halonicjs/adapter-memory";
import { ConnectorToolError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  makePluginsFolder,
  onWindows,
  put,
  refusedWith,
  removePluginsFolder,
  setup,
} from "./host-plugin-backends.test-helper.ts";
import { unavailablePluginBackends } from "./host-plugin-backends.ts";
import { PluginRefusal } from "./plugin-refusal.ts";
import { pluginSignIns } from "./plugin-sign-ins.ts";

beforeEach(makePluginsFolder);
afterEach(removePluginsFolder);

verifies("agent-host.plugin-routes", () => {
  describe("the shipped executable's backends", () => {
    it("refuse every call as not in this build and start nothing", async () => {
      const backends = unavailablePluginBackends();
      await expect(backends.trustedFingerprint("acme")).rejects.toMatchObject({
        code: "not_in_this_build",
      });
      await expect(backends.trustedSecretNames("acme")).rejects.toMatchObject({
        code: "not_in_this_build",
      });
      await expect(backends.open("acme", "f")).rejects.toBeInstanceOf(PluginRefusal);
    });
  });

  describe("the host's plugin backends", () => {
    it("starts a trusted plugin's backend in the runner and calls its tool", async () => {
      const { backends, seen } = await setup();
      const fingerprint = await backends.trustedFingerprint("acme");
      const client = await backends.open("acme", fingerprint);
      expect(await client.callTool("echo", {})).toBe("answer from echo");
      await client.close();
      expect(seen).toEqual({ starts: 1, stops: 1 });
    });

    it("refuses a plugin nobody trusted, and starts nothing", async () => {
      const { backends, seen } = await setup({ trusted: false });
      expect(await refusedWith(backends.trustedFingerprint("acme"))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("refuses a plugin that isn't in the plugins folder", async () => {
      const { backends } = await setup();
      expect(await refusedWith(backends.trustedFingerprint("absent"))).toBe("plugin_not_trusted");
    });

    it("refuses a plugin whose file changed after it was trusted", async () => {
      const { backends, seen } = await setup();
      await put({ "acme/backend/index.js": "export default { changed: true };\n" });
      expect(await refusedWith(backends.trustedFingerprint("acme"))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("refuses the start when the plugin changed after the fingerprint was checked", async () => {
      const { backends, seen } = await setup();
      const fingerprint = await backends.trustedFingerprint("acme");
      await put({ "acme/backend/index.js": "export default { swapped: true };\n" });
      expect(await refusedWith(backends.open("acme", fingerprint))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("refuses the start for a fingerprint the folder never had", async () => {
      const { backends, seen } = await setup();
      expect(await refusedWith(backends.open("acme", "hfp1:other"))).toBe("plugin_not_trusted");
      expect(seen.starts).toBe(0);
    });

    it("answers not_fenced and starts nothing where the sandbox fails its check", async () => {
      const { backends, seen, logged } = await setup({ check: onWindows });
      const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
      expect(await refusedWith(client.callTool("echo", {}))).toBe("not_fenced");
      expect(seen.starts).toBe(0);
      expect(logged.join("")).toContain("windows");
    });

    it("answers not_fenced on Windows even when the sandbox passes its check, as the host wires no MXC", async () => {
      const { backends, seen } = await setup({ platform: "win32" });
      const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
      expect(await refusedWith(client.callTool("echo", {}))).toBe("not_fenced");
      expect(seen.starts).toBe(0);
    });

    it("starts without the sandbox only with the user's saved yes for the reason at this start", async () => {
      const { backends, seen, launched } = await setup({ platform: "win32", allowed: "windows" });
      const fingerprint = await backends.trustedFingerprint("acme");
      const client = await backends.open("acme", fingerprint);
      await client.callTool("echo", {});
      expect(seen.starts).toBe(1);
      expect(launched.inLauncher).toBe(1);
      await client.close();
    });

    it("starts nothing with a saved yes for another reason", async () => {
      const { backends, seen } = await setup({
        check: { ok: false, reason: "container", missing: [] },
        allowed: "windows",
      });
      const fingerprint = await backends.trustedFingerprint("acme");
      const client = await backends.open("acme", fingerprint);
      expect(await refusedWith(client.callTool("echo", {}))).toBe("not_fenced");
      expect(seen.starts).toBe(0);
    });

    it.each([
      ["a path", "../acme"],
      ["a nested path", "acme/backend"],
      ["a Windows path", "acme\\backend"],
      ["a dot", "."],
      ["two dots", ".."],
      ["an empty id", ""],
      ["capitals", "Acme"],
      ["a drive", "c:"],
      ["a stream", "acme:stream"],
      ["a hidden name", ".acme"],
      ["a null byte", "acme\0"],
      ["a space", "acme "],
      ["a trailing dot", "acme."],
      ["a Windows device name", "con"],
      ["a Windows device name with an extension", "nul.txt"],
    ])("reads nothing from the disk for %s as a plugin id", async (_name, plugin) => {
      const { backends, readNames } = await setup();
      expect(await refusedWith(backends.trustedFingerprint(plugin))).toBe("plugin_not_trusted");
      expect(readNames).toEqual([]);
    });

    it("keeps a runner after a tool's own error, and not after any other failure", async () => {
      const { backends } = await setup();
      expect(backends.runnerSurvives(new RunnerToolError("bad input"))).toBe(true);
      expect(backends.runnerSurvives(new ConnectorToolError("acme", "list-files", "no"))).toBe(
        true,
      );
      expect(backends.runnerSurvives(new Error("the runner stopped"))).toBe(false);
    });
  });
});

verifies("agent-host.plugin-secrets", () => {
  describe("the names of a plugin's secrets", () => {
    it("names each secret a trusted plugin declares by the plugin's own name for it", async () => {
      const { backends } = await setup();
      expect(await backends.trustedSecretNames("acme")).toEqual({
        "acme-key": "plugin__acme__acme-key",
      });
    });

    it("names no secret of a plugin nobody trusted, or one that changed since", async () => {
      const untrusted = await setup({ trusted: false });
      expect(await refusedWith(untrusted.backends.trustedSecretNames("acme"))).toBe(
        "plugin_not_trusted",
      );
      const { backends } = await setup();
      await put({ "acme/backend/index.js": "export default { changed: true };\n" });
      expect(await refusedWith(backends.trustedSecretNames("acme"))).toBe("plugin_not_trusted");
    });
  });
});

/** The fixture plugin with a sign-in that names a client secret, and `sdk: 2`, which a sign-in needs. */
const signInManifest = `id: acme
version: 1.0.0
sdk: 2
name: Acme
backend:
  hosts: [api.acme.example]
  secrets:
    acme-client: { purpose: The Acme app's client secret }
  signIns:
    acme-account:
      purpose: Access to your Acme account.
      flow: oauth-code
      authorizeUrl: https://auth.acme.example/authorize
      tokenUrl: https://auth.acme.example/token
      clientId: { fromSetting: clientId }
      clientSecret: acme-client
      access: { hosts: [api.acme.example], as: bearer }
  tools:
    - { name: echo, description: Echoes., risk: read, untrusted: true }
`;

verifies("agent-host.plugin-sign-ins", () => {
  describe("a plugin's sign-ins", () => {
    beforeEach(async () => {
      await put({ "acme/plugin.yaml": signInManifest });
    });

    it("reads the trusted plugin's backend sheet and the settings its backend starts with", async () => {
      const { machine } = await setup({ settings: { clientId: "acme-app" } });
      const signIns = pluginSignIns({ machine, secrets: new MemorySecrets({}) });
      const read = await signIns("acme")?.read();
      expect(read?.sheet.id).toBe("acme");
      expect(Object.keys(read?.sheet.signIns ?? {})).toEqual(["acme-account"]);
      expect(read?.settings).toEqual({ clientId: "acme-app" });
    });

    it("reads the client secret only from the plugin's own handed-over secrets", async () => {
      const { machine } = await setup();
      const secrets = new MemorySecrets({
        "plugin__acme__acme-client": "acme-client-value",
        "acme-client": "workspace-value",
        "plugin__rain__acme-client": "other-plugin-value",
      });
      const signIns = pluginSignIns({ machine, secrets })("acme");
      expect(await signIns?.secrets.get("acme-client")).toBe("acme-client-value");
      expect(await signIns?.secrets.get("plugin__acme__acme-client")).toBeNull();
    });

    it("gives no sheet and no client secret for a plugin nobody trusted, or one that changed since", async () => {
      const secrets = new MemorySecrets({ "plugin__acme__acme-client": "acme-client-value" });
      const untrusted = (await setup({ trusted: false })).machine;
      const notTrusted = pluginSignIns({ machine: untrusted, secrets })("acme");
      expect(await refusedWith(notTrusted?.read() ?? Promise.resolve())).toBe("plugin_not_trusted");
      const { machine } = await setup();
      await put({ "acme/backend/index.js": "export default { changed: true };\n" });
      const changed = pluginSignIns({ machine, secrets })("acme");
      expect(await refusedWith(changed?.read() ?? Promise.resolve())).toBe("plugin_not_trusted");
      expect(await refusedWith(changed?.secrets.get("acme-client") ?? Promise.resolve())).toBe(
        "plugin_not_trusted",
      );
    });

    it("runs no sign-ins for a name that can't be a plugin's id", async () => {
      const { machine } = await setup();
      const signIns = pluginSignIns({ machine, secrets: new MemorySecrets({}) });
      expect(signIns("../acme")).toBeUndefined();
      expect(signIns("Acme")).toBeUndefined();
    });

    it("gives a backend's start the sign-in tokens of its own plugin", async () => {
      const { backends, signInAsks } = await setup({ settings: { clientId: "acme-app" } });
      const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
      await client.close();
      expect(signInAsks).toEqual(["acme"]);
    });
  });
});
