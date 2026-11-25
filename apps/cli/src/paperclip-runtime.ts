// The Paperclip plugin runtime this copy of Halonic ships (HAL-17949,
// HAL-18001), as the plugin build service takes it: the built `worker.js`,
// the runtime's actions and capabilities, and the plugin's settings. All of
// it comes from the runtime package, never from a workspace.

import { readFile } from "node:fs/promises";
import type { PluginRuntime } from "@halonicjs/app";
import {
  precheckSettingProperties,
  workspacePinProperties,
} from "@halonicjs/target-paperclip-runtime";
import { pluginActions, runtimeCapabilities } from "@halonicjs/target-paperclip-runtime/actions";
import { DetailedError } from "./command.ts";
import { buildMessages } from "./messages/build.ts";

/** Where the runtime package's build writes the worker every plugin gets. */
export const runtimeWorkerUrl = new URL(
  "../dist/worker.js",
  import.meta.resolve("@halonicjs/target-paperclip-runtime/actions"),
);

/**
 * The read token's setting. Paperclip keeps a secret reference in it, never
 * the token, and checks it against this schema as the secret's id.
 */
const githubTokenSetting = {
  type: "string",
  title: "GitHub read token",
  description:
    "The secret with a GitHub token that can read the workspace repository and the repositories the tools list. The plugin only sends GET requests to api.github.com with it.",
  format: "secret-ref",
};

/**
 * Reads the shipped runtime.
 *
 * @param workerUrl - where the built worker is; tests pass their own
 * @throws DetailedError `not_found` when the worker isn't built
 */
export async function shippedPluginRuntime(workerUrl = runtimeWorkerUrl): Promise<PluginRuntime> {
  const worker = await readFile(workerUrl).catch(() => {
    throw new DetailedError("not_found", buildMessages.noRuntime(), buildMessages.noRuntimeFix());
  });
  return {
    worker: new Uint8Array(worker),
    actions: pluginActions(),
    capabilities: runtimeCapabilities,
    settings: {
      githubToken: githubTokenSetting,
      ...workspacePinProperties,
      ...precheckSettingProperties,
    },
  };
}
