import { isSea } from "node:sea";

import { createNodeHttpClient } from "@halonicjs/adapter-http-node";
import { MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { ProfileFolder } from "@halonicjs/profile";
import { proxySetting } from "../proxy-setting.ts";
import { hostPluginBackends, unavailablePluginBackends } from "./host-plugin-backends.ts";
import { hostPluginMachine } from "./host-plugin-machine.ts";
import { PluginSecretValues } from "./plugin-secret-values.ts";
import { PluginTable } from "./plugin-table.ts";

/** The host's plugins: their runners, and the secrets Studio handed over for them. */
export interface HostPlugins {
  readonly table: PluginTable;
  /** Kept in memory only; the backends read them, and `POST /v1/plugins/secrets` replaces them. */
  readonly secretValues: PluginSecretValues;
  /** Stops every runner, drops the secrets and removes the temp folders of the starts. */
  stop(): Promise<void>;
}

/** The table of plugin runners, started in the host's own sandbox. */
export function hostPlugins(
  version: string,
  sandbox: SrtSandbox,
  profile: ProfileFolder | undefined,
): HostPlugins | undefined {
  if (profile === undefined) return undefined;
  const secretValues = new PluginSecretValues();
  if (isSea()) {
    const table = new PluginTable(unavailablePluginBackends());
    return { table, secretValues, stop: async () => undefined };
  }
  const { machine, dispose } = hostPluginMachine({ fenced: sandbox, profile, version });
  // A backend reads only the secrets Studio handed over for its plugin, and no sign-in token yet.
  const context = {
    secrets: secretValues.secrets,
    tokens: new MemoryTokenStore(),
    http: createNodeHttpClient({ hostClass: () => "public", proxy: proxySetting }),
    trust: null,
  };
  const table = new PluginTable(hostPluginBackends(machine, context, logToError), {
    secretValues,
  });
  return {
    table,
    secretValues,
    stop: async () => {
      await table.closeAll();
      await dispose();
    },
  };
}

function logToError(text: string): void {
  process.stderr.write(text);
}
