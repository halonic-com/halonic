import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { build } from "esbuild";
import { afterAll, beforeAll, expect, it } from "vitest";
import { stageLayer } from "./stage.ts";

// Packs both packages the way the release does and installs the tarballs
// into a fresh folder outside the workspace, so nothing resolves through a
// workspace link. The outside dependencies are linked from the workspace
// install instead of downloaded, so the test needs no network.

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const scratch = mkdtempSync(join(tmpdir(), "pack-"));
const consumer = join(scratch, "consumer");
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

/** Stages and packs a layer package, then unpacks the tarball into the consumer's node_modules. */
function install(layer: string): void {
  const staged = stageLayer(
    root,
    join(root, "tooling/publish/layers", layer),
    join(scratch, layer),
  );
  const tarballs = join(scratch, "tarballs");
  mkdirSync(tarballs, { recursive: true });
  const tarball = run("npm", ["pack", "--silent", "--pack-destination", tarballs], staged.directory)
    .trim()
    .split("\n")
    .at(-1);
  const target = join(consumer, "node_modules", staged.name);
  mkdirSync(target, { recursive: true });
  run("tar", ["-xzf", join(tarballs, String(tarball)), "-C", target, "--strip-components=1"], root);
}

/** Links an outside dependency from the workspace install into the consumer's node_modules. */
function linkFromWorkspace(name: string, installedIn: string): void {
  symlinkSync(
    realpathSync(join(root, installedIn, "node_modules", name)),
    join(consumer, "node_modules", name),
  );
}

beforeAll(() => {
  mkdirSync(join(consumer, "node_modules"), { recursive: true });
  writeFileSync(join(consumer, "package.json"), '{ "private": true, "type": "module" }\n');
  install("adapters");
  install("testing");
  linkFromWorkspace("zod", "packages/core/schema-kit");
  linkFromWorkspace("yaml", "packages/core/yaml");
  linkFromWorkspace("vitest", "tooling/publish");
}, 180_000);

verifies("publish.packed-import", () => {
  it("imports the packed kit and suite from a fresh folder, with one copy of the error classes", () => {
    const script = `
      import * as kit from "@halonicjs/adapters/integration-kit";
      import * as suite from "@halonicjs/testing/integration";
      console.log(JSON.stringify({
        runTool: typeof kit.runTool,
        timeoutError: typeof kit.IntegrationTimeoutError,
        conformance: typeof suite.describeIntegrationConformance,
        pluginConformance: typeof suite.describePluginConformance,
      }));
    `;
    const output = run("node", ["--input-type=module", "-e", script], consumer);
    expect(JSON.parse(output)).toEqual({
      runTool: "function",
      timeoutError: "function",
      conformance: "function",
      pluginConformance: "function",
    });

    const suiteFiles = readdirSync(join(consumer, "node_modules/@halonicjs/testing"), {
      recursive: true,
      encoding: "utf8",
    });
    expect(suiteFiles.filter((file) => file.includes("integration-kit/src/integration/"))).toEqual(
      [],
    );
  }, 60_000);

  it("type-checks code that uses the packed packages", () => {
    writeFileSync(
      join(consumer, "use.ts"),
      `import { IntegrationTimeoutError, maxIntegrationWaitMs, runTool } from "@halonicjs/adapters/integration-kit";
import { describeIntegrationConformance } from "@halonicjs/testing/integration";

export const timeout: Error = new IntegrationTimeoutError("example.com took too long");
export const wait: number = maxIntegrationWaitMs;
// @ts-expect-error The types are real, not any: a wait time is no string.
export const wrong: string = maxIntegrationWaitMs;
export { describeIntegrationConformance, runTool };
`,
    );
    writeFileSync(
      join(consumer, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "nodenext",
          target: "es2024",
          lib: ["es2024", "dom"],
          strict: true,
          noEmit: true,
          types: [],
        },
        files: ["use.ts"],
      }),
    );
    // The compiler prints nothing when the code type-checks.
    expect(run(join(root, "tooling/publish/node_modules/.bin/tsc"), ["-p", "."], consumer)).toBe(
      "",
    );
  }, 60_000);

  it("bundles an integration that uses the kit into a cloud bundle check:bundle accepts", async () => {
    writeFileSync(
      join(consumer, "integration.ts"),
      `import { IntegrationRefusedError, runTool } from "@halonicjs/adapters/integration-kit";
export default { runTool, IntegrationRefusedError };
`,
    );
    const result = await build({
      absWorkingDir: consumer,
      entryPoints: ["integration.ts"],
      bundle: true,
      format: "esm",
      platform: "neutral",
      outfile: "out/integration.js",
      metafile: true,
      logLevel: "silent",
    });
    expect(
      Object.keys(result.metafile.inputs).some((input) => input.includes("integration-kit")),
    ).toBe(true);
    const metafile = join(consumer, "out/integration.meta.json");
    writeFileSync(metafile, JSON.stringify(result.metafile));
    run("node", ["tooling/check/src/cli/bundle.ts", "--target", "cloudflare", metafile], root);
  }, 60_000);
});
