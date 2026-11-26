import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import {
  getRequiredCapability,
  type PaperclipPluginManifestV1,
  type PluginCapability,
} from "@paperclipai/plugin-sdk";
import { type BuildOptions, build } from "esbuild";
import { describe, expect, test } from "vitest";
import { workerBuildOptions } from "./plugin/build-options.ts";
import { manifest as agentToolsManifest } from "./plugin/manifest.ts";
import { manifest as seatsManifest } from "./seats/plugin/manifest.ts";

/**
 * Every host call a plugin's worker makes needs its capability in that
 * plugin's manifest, or the host refuses the call at run time (HAL-19468:
 * `seats` 0.1.0 called `companies.list` without `companies.read`, and every
 * job failed). This bundles each worker as its build does, reads the
 * package's own source files that end up in it, and checks each host call
 * against the SDK's own method-to-capability map.
 */

interface PluginUnderTest {
  readonly manifest: PaperclipPluginManifestV1;
  readonly buildOptions: BuildOptions;
  /** Host calls known to lack their capability, each with the task that decides it. */
  readonly knownGaps?: readonly string[];
}

const sourceRoot = fileURLToPath(new URL("./", import.meta.url));

const plugins: readonly PluginUnderTest[] = [
  {
    manifest: agentToolsManifest,
    buildOptions: workerBuildOptions,
    // The chief line creates a missing thread without `issues.create`; adding a write
    // capability is Liam's call (HAL-19468 follow-up), so it stays listed here until then.
    knownGaps: ["issues.create"],
  },
  {
    manifest: seatsManifest,
    // As src/seats/plugin/build.ts bundles the worker.
    buildOptions: {
      entryPoints: [fileURLToPath(new URL("./seats/plugin/worker.ts", import.meta.url))],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node24",
    },
  },
];

/** A host call such as `ctx.companies.list(` or `api.issues.createComment(`. */
const hostCall = /\.([a-zA-Z]+)\.([a-zA-Z]+)\(/g;

/** This package's source files that the worker bundle holds. */
async function bundledSources(options: BuildOptions): Promise<string[]> {
  const result = await build({
    ...options,
    write: false,
    metafile: true,
    outdir: "dist",
    logLevel: "silent",
  });
  return Object.keys(result.metafile.inputs)
    .map((input) => fileURLToPath(new URL(input, `file://${process.cwd()}/`)))
    .filter((path) => path.startsWith(sourceRoot) && !path.endsWith(".test.ts"));
}

/** Each host method the files call, with the capability the SDK says it needs. */
async function hostCalls(files: readonly string[]): Promise<Map<string, PluginCapability>> {
  const calls = new Map<string, PluginCapability>();
  for (const file of files) {
    const code = await readFile(file, "utf8");
    for (const [, namespace, method] of code.matchAll(hostCall)) {
      const name = `${namespace}.${method}`;
      const capability = getRequiredCapability(name as Parameters<typeof getRequiredCapability>[0]);
      // The SDK maps calls that need no capability, such as `config.get`, to null.
      if (typeof capability === "string") {
        calls.set(name, capability);
      }
    }
  }
  return calls;
}

verifies("paperclip.plugin-capabilities", () => {
  describe.each(plugins)("$manifest.id", ({ manifest, buildOptions, knownGaps = [] }) => {
    test("lists the capability of every host call its worker makes", async () => {
      const calls = await hostCalls(await bundledSources(buildOptions));
      expect(calls.size).toBeGreaterThan(0);
      const missing = [...calls]
        .filter(([method]) => !knownGaps.includes(method))
        .filter(([, capability]) => !manifest.capabilities.includes(capability))
        .map(([method, capability]) => `${method} needs ${capability}`);
      expect(missing).toEqual([]);
    });
  });

  test("seats lists companies.read, because seats.read lists the companies", () => {
    expect(seatsManifest.capabilities).toContain("companies.read");
  });
});
