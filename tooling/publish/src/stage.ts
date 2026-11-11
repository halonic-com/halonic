import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { packageOf, rewriteSpecifiers } from "./specifiers.ts";
import { requireMatchingVersions } from "./versions.ts";
import {
  findLayers,
  findWorkspacePackages,
  type LayerConfig,
  readLayerConfig,
  type WorkspacePackage,
} from "./workspace.ts";

/** What `stageLayer` produced. */
export type StagedPackage = {
  /** The folder to hand to `npm publish`. */
  directory: string;
  name: string;
  version: string;
};

/** One subpath of a layer package and the workspace entry it publishes. */
export type LayerSubpath = {
  /** `.` or `./integration-kit`. */
  subpath: string;
  /** The TypeScript source file of the published entry. */
  file: string;
  /** The workspace package the entry belongs to. */
  packageDirectory: string;
};

/**
 * Builds the publishable copy of one layer package into `outputDirectory`
 * (default `tooling/publish/dist/<layer>`).
 *
 * Every workspace package of the layer whose `halonic.publish` names the
 * layer package becomes one subpath. The compiler emits those entries and
 * every workspace package they import into one tree, imports of those
 * packages become relative paths, imports of an entry another layer package
 * publishes become imports of that package (its files are left out), and the
 * manifest is written from the layer's `layer.json`. It fails when the result
 * imports anything the manifest doesn't declare, so a tarball can never depend
 * on a private workspace package.
 */
export function stageLayer(
  root: string,
  layerDirectory: string,
  outputDirectory?: string,
): StagedPackage {
  const config = readLayerConfig(layerDirectory);
  const workspace = findWorkspacePackages(root);
  const subpaths = layerSubpaths(config, workspace, root);
  const directory = outputDirectory ?? join(root, "tooling/publish/dist", config.layer);
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });

  const packagesRoot = join(root, "packages");
  const distribution = join(directory, "dist");
  for (const { packageDirectory, file } of subpaths) {
    emit({ packageDirectory, entry: file, workspace, packagesRoot, outDir: distribution });
  }
  const imported = rewriteImports(
    distribution,
    workspace,
    packagesRoot,
    otherLayersEntries(config, workspace),
    config.name,
  );
  requireMatchingVersions(config, imported, findLayers(root));
  requireDeclaredImports(distribution, config);
  writeManifest(directory, config, subpaths, packagesRoot);
  for (const name of ["LICENSE", "NOTICE"]) copyFileSync(join(root, name), join(directory, name));
  copyFileSync(join(layerDirectory, "README.md"), join(directory, "README.md"));
  return { directory, name: config.name, version: config.version };
}

/**
 * The subpaths of a layer package: each workspace package whose
 * `halonic.publish.name` is the layer package's name (the main entry) or
 * that name with a subpath. Each must live in the layer's own folder.
 */
export function layerSubpaths(
  config: LayerConfig,
  workspace: readonly WorkspacePackage[],
  root: string,
): LayerSubpath[] {
  const subpaths = new Map<string, LayerSubpath>();
  for (const workspacePackage of workspace) {
    const published = workspacePackage.published;
    if (published === undefined || packageOf(published.name) !== config.name) continue;
    const layerFolder = join(root, "packages", config.layer);
    if (dirname(workspacePackage.directory) !== layerFolder) {
      throw new Error(
        `${workspacePackage.name} is published as ${published.name}, but only packages in packages/${config.layer} belong to ${config.name}.`,
      );
    }
    const file = workspacePackage.entries.get(published.entry);
    if (file === undefined) {
      throw new Error(
        `${workspacePackage.name}: halonic.publish.entry "${published.entry}" is not in the package's exports.`,
      );
    }
    const subpath = `.${published.name.slice(config.name.length)}`;
    const taken = subpaths.get(subpath);
    if (taken !== undefined) {
      throw new Error(
        `${config.name}: the subpath "${subpath}" is published by two packages, ${relative(root, taken.packageDirectory)} and ${relative(root, workspacePackage.directory)}.`,
      );
    }
    subpaths.set(subpath, { subpath, file, packageDirectory: workspacePackage.directory });
  }
  if (subpaths.size === 0) {
    throw new Error(
      `${config.name} has no subpaths: no package in packages/${config.layer} names it in halonic.publish.name.`,
    );
  }
  return [...subpaths.values()].sort((a, b) => a.subpath.localeCompare(b.subpath));
}

/**
 * The entries other layer packages publish, by workspace specifier
 * (`@halonicjs/adapter-integration-kit/integration`), with the import path
 * they are published under (`@halonicjs/adapters/integration-kit`).
 */
function otherLayersEntries(
  config: LayerConfig,
  workspace: readonly WorkspacePackage[],
): Map<string, string> {
  const entries = new Map<string, string>();
  for (const workspacePackage of workspace) {
    const published = workspacePackage.published;
    if (published === undefined || packageOf(published.name) === config.name) continue;
    entries.set(posix.join(workspacePackage.name, published.entry), published.name);
  }
  return entries;
}

function emit(options: {
  packageDirectory: string;
  entry: string;
  workspace: WorkspacePackage[];
  packagesRoot: string;
  outDir: string;
}): void {
  const paths: Record<string, string[]> = {};
  for (const workspacePackage of options.workspace) {
    for (const [subpath, file] of workspacePackage.entries) {
      paths[posix.join(workspacePackage.name, subpath)] = [file];
    }
  }
  // Written next to the package so its own tsconfig and type roots resolve.
  const configPath = join(options.packageDirectory, `tsconfig.stage-${process.pid}.json`);
  writeFileSync(
    configPath,
    JSON.stringify({
      extends: "./tsconfig.json",
      compilerOptions: {
        noEmit: false,
        declaration: true,
        outDir: options.outDir,
        rootDir: options.packagesRoot,
        paths,
      },
      include: [],
      files: [options.entry],
    }),
  );
  try {
    const run = spawnSync("pnpm", ["exec", "tsc", "-p", configPath], {
      cwd: options.packageDirectory,
      encoding: "utf8",
    });
    if (run.status !== 0) throw new Error(`tsc failed:\n${run.stdout}${run.stderr}`);
  } finally {
    rmSync(configPath, { force: true });
  }
}

function emittedFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".js") || file.endsWith(".d.ts"))
    .map((file) => join(directory, file));
}

/** An emitted path without its `.js`, `.ts` or `.d.ts` ending, so a module compares equal however it is named. */
function moduleOf(path: string): string {
  return path.replace(/(\.d)?\.(js|ts)$/, "");
}

function isInside(folder: string, path: string): boolean {
  return path.startsWith(folder + sep);
}

/**
 * Points every import at its emitted file, by a relative path ending in
 * `.js`. An import of an entry another layer package publishes becomes its
 * published import path instead, and the emitted copy of that entry's folder
 * is removed, so the tarball holds no second copy of the other package.
 * Returns the other layer packages it now imports.
 */
function rewriteImports(
  distribution: string,
  workspace: WorkspacePackage[],
  packagesRoot: string,
  aliases: ReadonlyMap<string, string>,
  layerName: string,
): Set<string> {
  const emittedPath = (source: string) => join(distribution, relative(packagesRoot, source));
  const targets = new Map<string, string>();
  for (const workspacePackage of workspace) {
    for (const [subpath, file] of workspacePackage.entries) {
      targets.set(posix.join(workspacePackage.name, subpath), moduleOf(emittedPath(file)));
    }
  }
  const aliasedModules = new Map<string, string>();
  const aliasedFolders: string[] = [];
  for (const [specifier, publishedName] of aliases) {
    const entryFile = aliasedEntryFile(specifier, workspace, layerName);
    aliasedModules.set(moduleOf(emittedPath(entryFile)), publishedName);
    aliasedFolders.push(emittedPath(dirname(entryFile)));
  }

  const imported = new Set<string>();
  for (const file of emittedFiles(distribution)) {
    if (aliasedFolders.some((folder) => isInside(folder, file))) continue;
    const original = readFileSync(file, "utf8");
    const rewritten = rewriteSpecifiers(original, (specifier) => {
      const target = specifier.startsWith(".")
        ? moduleOf(resolve(dirname(file), specifier))
        : targets.get(specifier);
      if (target === undefined) return undefined;
      const publishedName = aliasedModules.get(target);
      if (publishedName !== undefined) {
        imported.add(String(packageOf(publishedName)));
        return publishedName;
      }
      if (aliasedFolders.some((folder) => isInside(folder, target))) {
        throw new Error(
          `${relative(distribution, file)} imports "${specifier}" from inside an entry another layer package publishes. Import the entry itself, so the published package is used.`,
        );
      }
      const path = `${relative(dirname(file), target).split(sep).join("/")}.js`;
      return path.startsWith(".") ? path : `./${path}`;
    });
    if (rewritten !== original) writeFileSync(file, rewritten);
  }
  for (const folder of aliasedFolders) rmSync(folder, { recursive: true, force: true });
  return imported;
}

/**
 * The source file of the workspace entry another layer package publishes.
 * Its whole folder is left out of the tarball, so it fails when that folder
 * holds another entry of the same package: a published root entry
 * (`src/index.ts`) would otherwise take all of `src` with it.
 */
export function aliasedEntryFile(
  specifier: string,
  workspace: readonly WorkspacePackage[],
  layerName: string,
): string {
  for (const workspacePackage of workspace) {
    for (const [subpath, file] of workspacePackage.entries) {
      if (posix.join(workspacePackage.name, subpath) !== specifier) continue;
      const folder = dirname(file);
      const neighbours = [...workspacePackage.entries]
        .filter(([, other]) => other !== file && isInside(folder, other))
        .map(([otherSubpath]) => posix.join(workspacePackage.name, otherSubpath));
      if (neighbours.length > 0) {
        throw new Error(
          `${layerName}: the published entry "${specifier}" can't be left out of the tarball, because its folder also holds ${neighbours.join(", ")}. Only an entry in a folder of its own can be published.`,
        );
      }
      return file;
    }
  }
  throw new Error(
    `${layerName}: the published entry "${specifier}" is no workspace package entry.`,
  );
}

/** Throws when a compiled file imports a package the layer's `layer.json` does not declare. */
export function requireDeclaredImports(
  distribution: string,
  config: Pick<LayerConfig, "name" | "dependencies" | "peerDependencies">,
): void {
  const declared = new Set([
    ...Object.keys(config.dependencies),
    ...Object.keys(config.peerDependencies),
  ]);
  for (const file of emittedFiles(distribution)) {
    rewriteSpecifiers(readFileSync(file, "utf8"), (specifier) => {
      const name = packageOf(specifier);
      if (name !== undefined && !declared.has(name)) {
        throw new Error(
          `${relative(distribution, file)} imports "${specifier}", which ${config.name} does not declare. Bundle it (a workspace package) or add it to the dependencies in its layer.json.`,
        );
      }
      return undefined;
    });
  }
}

function writeManifest(
  directory: string,
  config: LayerConfig,
  subpaths: readonly LayerSubpath[],
  packagesRoot: string,
): void {
  const exports: Record<string, { types: string; default: string }> = {};
  for (const { subpath, file } of subpaths) {
    const base = `./dist/${relative(packagesRoot, file).split(sep).join("/").replace(/\.ts$/, "")}`;
    exports[subpath] = { types: `${base}.d.ts`, default: `${base}.js` };
  }
  const manifest = {
    name: config.name,
    version: config.version,
    description: config.description,
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/halonic-com/halonic.git",
      directory: `packages/${config.layer}`,
    },
    type: "module",
    sideEffects: false,
    exports,
    files: ["dist", "README.md", "LICENSE", "NOTICE"],
    dependencies: config.dependencies,
    peerDependencies: config.peerDependencies,
    publishConfig: { access: "public", provenance: true },
  };
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
