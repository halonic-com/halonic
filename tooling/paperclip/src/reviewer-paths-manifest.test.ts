import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { type BuildOptions, build } from "esbuild";
import { expect, test } from "vitest";
import { approvalOf } from "./merge-control/approval.ts";
import {
  enqueued,
  headOf,
  pass,
  pull,
  said,
  snapshot,
} from "./merge-control/merge-control.test-helper.ts";
import type { PullText } from "./merge-control/snapshot.ts";
import { workerBuildOptions } from "./plugin/build-options.ts";
import { reviewerRoleFor } from "./reviewer-paths.ts";
import { manifestFileOf, manifestImports } from "./reviewer-paths-manifest.ts";

/** The repo's root, so esbuild names its inputs as a pull request's files are named. */
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** The plugin manifests the build scripts bundle into `dist/`. */
const manifests = [
  "tooling/paperclip/src/plugin/manifest.ts",
  "tooling/paperclip/src/seats/plugin/manifest.ts",
];

/** The scripts `build:plugin` and `build:seats-plugin` run, which write the manifests into `dist/`. */
const buildScripts = [
  "tooling/paperclip/src/plugin/build.ts",
  "tooling/paperclip/src/seats/plugin/build.ts",
];

/** The package's pointer to the build scripts, in `manifestImports` beside them. */
const packageFile = "tooling/paperclip/package.json";

/**
 * Every repo file in a manifest's bundle, as `build:plugin` bundles it: type-only
 * imports drop out, as they do from `dist/manifest.js`. Packages from
 * `node_modules` aren't ours to list; a workspace package would show by its path.
 */
async function closureOf(manifest: string): Promise<string[]> {
  return await repoInputsOf({ ...workerBuildOptions, entryPoints: [manifest] });
}

/**
 * Every repo file a build script runs, as Node runs it: only esbuild stays outside,
 * so a workspace package would show by its path, and type-only imports drop
 * out, as Node's type stripping drops them.
 */
async function buildClosureOf(script: string): Promise<string[]> {
  return await repoInputsOf({
    entryPoints: [script],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["esbuild"],
  });
}

/** The repo files esbuild reads for this build, named from the repo's root. */
async function repoInputsOf(options: BuildOptions): Promise<string[]> {
  const result = await build({
    ...options,
    absWorkingDir: repoRoot,
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  return Object.keys(result.metafile.inputs).filter((path) => !path.includes("node_modules/"));
}

verifies("paperclip.manifest-closure", () => {
  test("manifestFileOf names every module in each manifest's import closure", async () => {
    for (const manifest of manifests) {
      const closure = await closureOf(manifest);
      expect(closure).toContain(manifest);
      const missed = closure.filter((path) => manifestFileOf([path]) === undefined);
      expect(missed, `add these to manifestImports and the deployer's MANIFEST_IMPORTS`).toEqual(
        [],
      );
    }
  });

  test("manifestFileOf names every module the build scripts run", async () => {
    for (const script of buildScripts) {
      const closure = await buildClosureOf(script);
      expect(closure).toContain(script);
      const missed = closure.filter((path) => manifestFileOf([path]) === undefined);
      expect(missed, `add these to manifestImports and the deployer's MANIFEST_IMPORTS`).toEqual(
        [],
      );
    }
  });

  test("the build scripts don't run the merge rules", async () => {
    for (const script of buildScripts) {
      const closure = await buildClosureOf(script);
      expect(closure, script).not.toContain("tooling/paperclip/src/merge-control/decide-file.ts");
    }
  });

  test("manifestImports names only modules in a closure, and the package file", async () => {
    const closures = new Set(
      (
        await Promise.all([...manifests.map(closureOf), ...buildScripts.map(buildClosureOf)])
      ).flat(),
    );
    const stale = manifestImports.filter((path) => !closures.has(path) && path !== packageFile);
    expect(stale, "remove these from manifestImports and the deployer's list").toEqual([]);
    expect(existsSync(`${repoRoot}${packageFile}`)).toBe(true);
  });

  test("a change to a module two imports down, or to a build file, needs Julian", () => {
    for (const file of [
      "tooling/paperclip/src/seat-mover/settings.ts",
      "tooling/paperclip/src/merge-control/budget.ts",
      "tooling/paperclip/src/plugin/build.ts",
    ]) {
      expect(manifestFileOf([file])).toBe(file);
      expect(reviewerRoleFor({ files: [file], changedLines: 2, sensitive: false })).not.toBe(
        "routine-reviewer",
      );
    }
    expect(manifestFileOf(["tooling/paperclip/src/seat-mover/settings.test.ts"])).toBeUndefined();
  });

  test("the Merger doesn't queue a seat-mover settings change on Liam's approval alone", () => {
    const head = headOf(1);
    const file = "tooling/paperclip/src/seat-mover/settings.ts";
    const changed = { files: [file], fileNet: { [file]: 2 } };
    const liam = said(`Liam: approved on head \`${head.slice(0, 7)}\``);
    const julian = said(`Julian: approved on head \`${head.slice(0, 7)}\``);
    const added = (texts: PullText[]): number[] =>
      enqueued(pass(snapshot({ pulls: [pull(1, { ...changed, texts })] })));
    expect(added([liam])).toEqual([]);
    expect(approvalOf(pull(1, { ...changed, texts: [liam] }), "halonic-dev", {}).reasons).toEqual([
      `changes a plugin manifest (${file}): needs Julian's approval on head ${head.slice(0, 9)} too`,
    ]);
    expect(added([liam, julian])).toEqual([1]);
  });
});
