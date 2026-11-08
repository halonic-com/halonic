import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  adapterRuntimes,
  findRepoRoot,
  folderNamePattern,
  loadContext,
  placeOf,
  targetKinds,
} from "@halonicjs/tooling-check";
import { fixFeatureList, writeFeaturesFile } from "../features.ts";
import { type PackageSpec, packageFiles } from "../templates.ts";

/**
 * pnpm new package <layer>/<name> [--owner <agent>] [--runtime <runtime>]
 * pnpm new package targets/<target>/<kind> [--owner <agent>]
 * pnpm new feature <name> [--owner <agent>]
 *
 * Creates an empty package or Studio feature that passes every check, so
 * nobody has to copy and edit another package (plan 6.4).
 * Layers: core, adapters, host, targets, studio, testing, tooling, apps.
 */

const runtimes = adapterRuntimes.join(" | ");

const usage = [
  "Usage:",
  "  pnpm new package <layer>/<name> [--owner <agent>]   layers: core, host, studio, testing, tooling, apps",
  `  pnpm new package adapters/<name> --runtime <${runtimes}> [--owner <agent>]`,
  `  pnpm new package targets/<target>/<${targetKinds.join(" | ")}> [--owner <agent>]`,
  "  pnpm new feature <name> [--owner <agent>]",
].join("\n");

const layerFolders: Readonly<Record<string, string>> = {
  core: "packages/core",
  adapters: "packages/adapters",
  host: "packages/host",
  targets: "packages/targets",
  studio: "packages/studio",
  testing: "packages/testing",
  tooling: "tooling",
  apps: "apps",
};

function defaultOwner(root: string): string {
  try {
    return execFileSync("git", ["config", "user.name"], { cwd: root, encoding: "utf8" })
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

function resolveDirectory(kind: string, target: string): string {
  if (kind === "feature") {
    return `packages/studio/features/${target}`;
  }
  const [layer = "", ...names] = target.split("/");
  const folder = layerFolders[layer];
  const depth = layer === "targets" ? 2 : 1;
  if (folder === undefined || names.length !== depth || names.includes("")) {
    throw new Error(`"${target}" is not <layer>/<name> or targets/<target>/<kind>.\n${usage}`);
  }
  return `${folder}/${names.join("/")}`;
}

function addToCoreOrder(root: string, name: string): void {
  const path = join(root, "tooling/check/policy.json");
  const policy = JSON.parse(readFileSync(path, "utf8")) as { coreOrder: string[] };
  policy.coreOrder.push(name);
  writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`);
}

/** Reads the command line into the package to create. Throws on a usage error. */
function specFrom(root: string, argv: readonly string[]): PackageSpec {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: { owner: { type: "string" }, runtime: { type: "string" } },
    allowPositionals: true,
  });
  const [kind = "", target = ""] = positionals;
  if ((kind !== "package" && kind !== "feature") || target === "" || positionals.length > 2) {
    throw new Error(usage);
  }
  const directory = resolveDirectory(kind, target);
  const folders = directory.split("/").slice(directory.startsWith("packages/targets/") ? 2 : -1);
  const badFolder = folders.find((folder) => !folderNamePattern.test(folder));
  if (badFolder !== undefined) {
    throw new Error(`"${badFolder}" must be a kebab-case name such as "schema-kit".`);
  }
  const place = placeOf(directory);
  if (place === undefined) {
    throw new Error(`${directory} is not a place for a package.\n${usage}`);
  }
  const runtime = values.runtime;
  if (place.layer === "adapters" && !(adapterRuntimes as readonly unknown[]).includes(runtime)) {
    throw new Error(`Say where the adapter runs with --runtime <${runtimes}>.`);
  }
  if (place.layer !== "adapters" && runtime !== undefined) {
    throw new Error("Only adapters take --runtime; the folder decides where other packages run.");
  }
  const owner = values.owner ?? defaultOwner(root);
  if (owner === "") {
    throw new Error("Name the owner with --owner <agent>.");
  }
  return {
    directory,
    name: place.expectedName,
    layer: place.layer,
    owner,
    isFeature: place.isFeature,
    folder: folders.join("-"),
    ...(runtime === undefined ? {} : { runtime }),
    ...(place.target === undefined ? {} : { target: place.target }),
  };
}

function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  const spec = specFrom(root, argv);
  if (existsSync(join(root, spec.directory))) {
    console.error(`${spec.directory} already exists.`);
    return 1;
  }
  for (const [file, text] of Object.entries(packageFiles(spec))) {
    const path = join(root, spec.directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  if (spec.layer === "core") {
    addToCoreOrder(root, spec.name);
  }
  if (spec.isFeature) {
    fixFeatureList(loadContext(root));
    writeFeaturesFile(loadContext(root));
  }
  const where = spec.runtime === undefined ? "" : `, runtime ${spec.runtime}`;
  console.log(
    `Created ${spec.name} in ${spec.directory} (layer ${spec.layer}${where}, owner ${spec.owner}).`,
  );
  console.log("Next: pnpm install, then fill in README.md and run pnpm verify.");
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 2;
}
