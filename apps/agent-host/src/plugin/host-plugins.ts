import { isSea } from "node:sea";

import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { ProfileFolder } from "@halonicjs/profile";
import { proxySetting } from "../proxy-setting.ts";
import { hostPluginBackends, unavailablePluginBackends } from "./host-plugin-backends.ts";
import { hostPluginMachine } from "./host-plugin-machine.ts";
import { PluginTable } from "./plugin-table.ts";

/**
 * The table of plugin runners, started in the host's own sandbox. `stop`
 * stops every runner and removes the temp folders of their starts.
 */
export function hostPlugins(
  version: string,
  sandbox: SrtSandbox,
  profile: ProfileFolder | undefined,
): { table: PluginTable; stop(): Promise<void> } | undefined {
  if (profile === undefined) return undefined;
  if (isSea()) {
    return { table: new PluginTable(unavailablePluginBackends()), stop: async () => undefined };
  }
  const { machine, dispose } = hostPluginMachine({ fenced: sandbox, profile, version });
  // A backend reads no secret and no sign-in token yet.
  const context = {
    secrets: { get: async () => null },
    tokens: new MemoryTokenStore(),
    http: createNodeHttpClient({ hostClass: () => "public", proxy: proxySetting }),
    trust: null,
  };
  const table = new PluginTable(hostPluginBackends(machine, context, logToError));
  return {
    table,
    stop: async () => {
      await table.closeAll();
      await dispose();
    },
  };
}

function logToError(text: string): void {
  process.stderr.write(text);
}
