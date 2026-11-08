import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { findRepoRoot, folderNamePattern, loadContext, placeOf } from "@halonicjs/tooling-check";
import { fixFeatureList, writeFeaturesFile } from "../features.ts";
import { type PackageSpec, packageFiles } from "../templates.ts";

/**
 * pnpm new package <layer>/<name> [--owner <agent>]
 * pnpm new feature <name> [--owner <agent>]
 *
 * Creates an empty package or Studio feature that passes every check, so
 * nobody has to copy and edit another package (plan 6.4).
 * Layers: core, adapters, studio, testing, tooling, apps.
 */

const usage = [
  "Usage:",
  "  pnpm new package <layer>/<name> [--owner <agent>]   layers: core, adapters, studio, testing, tooling, apps",
  "  pnpm new feature <name> [--owner <agent>]",
].join("\n");

const layerFolders: Readonly<Record<string, string>> = {
  core: "packages/core",
  adapters: "packages/adapters",
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
  const [layer = "", name = "", ...rest] = target.split("/");
  const folder = layerFolders[layer];
  if (folder === undefined || name === "" || rest.length > 0) {
    throw new Error(`"${target}" is not <layer>/<name>.\n${usage}`);
  }
  return `${folder}/${name}`;
}

function addToCoreOrder(root: string, name: string): void {
  const path = join(root, "tooling/check/policy.json");
  const policy = JSON.parse(readFileSync(path, "utf8")) as { coreOrder: string[] };
  policy.coreOrder.push(name);
  writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`);
}

function main(argv: readonly string[]): number {
  const [kind = "", target = ""] = argv;
  const ownerIndex = argv.indexOf("--owner");
  if ((kind !== "package" && kind !== "feature") || target === "") {
    console.error(usage);
    return 2;
  }
  const root = findRepoRoot();
  const directory = resolveDirectory(kind, target);
  const folder = directory.split("/").at(-1) ?? "";
  const place = placeOf(directory);
  if (place === undefined || !folderNamePattern.test(folder)) {
    console.error(`"${folder}" must be a kebab-case name such as "schema-kit".`);
    return 2;
  }
  if (existsSync(join(root, directory))) {
    console.error(`${directory} already exists.`);
    return 1;
  }
  const owner = ownerIndex === -1 ? defaultOwner(root) : (argv[ownerIndex + 1] ?? "");
  if (owner === "") {
    console.error("Name the owner with --owner <agent>.");
    return 2;
  }
  const spec: PackageSpec = {
    directory,
    name: place.expectedName,
    layer: place.layer,
    owner,
    isFeature: place.isFeature,
    folder,
  };
  for (const [file, text] of Object.entries(packageFiles(spec))) {
    const path = join(root, directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  if (place.layer === "core") {
    addToCoreOrder(root, spec.name);
  }
  if (place.isFeature) {
    fixFeatureList(loadContext(root));
    writeFeaturesFile(loadContext(root));
  }
  console.log(`Created ${spec.name} in ${directory} (layer ${place.layer}, owner ${owner}).`);
  console.log("Next: pnpm install, then fill in README.md and run pnpm verify.");
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 2;
}
