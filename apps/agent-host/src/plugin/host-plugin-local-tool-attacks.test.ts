import { mkdtemp, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pluginLocalToolsSource } from "@halonicjs/adapter-connector-stdio-sandbox";
import { createRunnerSearch, nodeLaunchFolders } from "@halonicjs/adapter-mcp";
import type { PluginConnectorSources } from "@halonicjs/app";
import type { Sandbox, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  makePluginsFolder,
  pluginsFolder,
  put,
  refusedWith,
  removePluginsFolder,
  setup,
  withLocalTool,
} from "./host-plugin-backends.test-helper.ts";

// Attacks on a plugin's local tool through the agent host's plugin calls
// (HAL-13056), with the local tool sessions the host really builds
// (`pluginLocalToolsSource`); only the sandbox is a stand-in, which counts
// what reached it and starts no program. What needs the real fence is
// attacked through the CLI, which builds its sessions from the same source
// (`apps/cli/fence/plugin-local-tool-attacks.fence.test.ts`).

beforeEach(async () => {
  await makePluginsFolder();
  await put({
    "acme/plugin.yaml": withLocalTool,
    "acme/tools/server.js": "console.log('lister');\n",
  });
});
afterEach(removePluginsFolder);

const swapScript = () => put({ "acme/tools/server.js": "console.log('swapped');\n" });

/** A sandbox that opens sessions with `fence` and counts what reached it. */
function recordingSandbox(fence: SandboxFence) {
  const seen = { opens: 0, starts: 0, closes: 0 };
  const sandbox: Pick<Sandbox, "check" | "open"> = {
    check: async () => ({ ok: true, reason: null, missing: [] }),
    open: async (profile) => {
      seen.opens += 1;
      return {
        profile,
        fence,
        start: async () => {
          seen.starts += 1;
          throw new Error("this sandbox starts no program");
        },
        onBlocked: () => () => undefined,
        close: async () => {
          seen.closes += 1;
        },
      };
    },
  };
  return { sandbox, seen };
}

/** The host's plugin backends with real local tool sessions in `sandbox`; `beforeFolder` runs before each session folder is made. */
async function hostWith(sandbox: Pick<Sandbox, "check" | "open">, beforeFolder = async () => {}) {
  const sessions = await mkdtemp(join(pluginsFolder(), "sessions-"));
  let source: PluginConnectorSources["localTools"] | undefined;
  const made = await setup({
    localTools: async (context) => {
      if (source === undefined) throw new Error("the local tools are set up below");
      return await source(context);
    },
  });
  const { machine } = made;
  source = pluginLocalToolsSource({
    sandbox,
    folders: {
      create: async () => {
        await beforeFolder();
        return await mkdtemp(join(sessions, "session-"));
      },
      remove: (folder) => nodeLaunchFolders.remove(folder),
    },
    runners: createRunnerSearch({}),
    deniedPaths: async () => [join(pluginsFolder(), "profile")],
    bridge: null,
    path: "",
    timeLimitMs: 60_000,
    clientInfo: { name: "halonic", version: "0.0.0-test" },
    startTrust: { plugins: machine.plugins, digest: machine.digest, trust: machine.trust },
    settings: (plugin) => machine.settings(plugin),
    onReleaseFailed: () => undefined,
  });
  return { ...made, sessions };
}

const fenced: SandboxFence = { state: "fenced" };

verifies("agent-host.plugin-local-tools", () => {
  it("doesn't run a script swapped after the plugin's connector opened under the checked fingerprint", async () => {
    const { sandbox, seen } = recordingSandbox(fenced);
    const { backends } = await hostWith(sandbox);
    const client = await backends.open("acme", await backends.trustedFingerprint("acme"));
    // The backend's call opens the connector, so only the local tool's own start can still refuse.
    expect(await client.callTool("echo", {})).toBe("answer from echo");
    await swapScript();

    expect(await refusedWith(client.callTool("list-files", {}))).toBe("plugin_not_trusted");
    expect(seen.opens).toBe(0);
    await client.close();
  });

  it("doesn't copy or run a script swapped while its session is prepared, and leaves no folder", async () => {
    const { sandbox, seen } = recordingSandbox(fenced);
    let swapped = false;
    const { backends, sessions } = await hostWith(sandbox, async () => {
      if (swapped) return;
      swapped = true;
      await swapScript();
    });
    const client = await backends.open("acme", await backends.trustedFingerprint("acme"));

    await expect(client.callTool("list-files", {})).rejects.toThrow(
      /changed after Halonic checked it/,
    );

    expect(swapped).toBe(true);
    expect(seen).toEqual({ opens: 0, starts: 0, closes: 0 });
    expect(await readdir(sessions)).toEqual([]);
    await client.close();
  });

  it("answers not_fenced and starts nothing in a session whose fence isn't proven", async () => {
    const { sandbox, seen } = recordingSandbox({ state: "not-fenced", reason: "probe reached" });
    const { backends, sessions } = await hostWith(sandbox);
    const client = await backends.open("acme", await backends.trustedFingerprint("acme"));

    expect(await refusedWith(client.callTool("list-files", {}))).toBe("not_fenced");
    expect(seen).toEqual({ opens: 1, starts: 0, closes: 1 });
    expect(await readdir(sessions)).toEqual([]);
    expect(await client.callTool("echo", {})).toBe("answer from echo");
    await client.close();
  });
});
