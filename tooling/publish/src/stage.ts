import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { packageOf, rewriteSpecifiers } from "./specifiers.ts";
import { requireMatchingVersions } from "./versions.ts";
import {
  describePackage,
  findWorkspacePackages,
  type PublishConfig,
  readJson,
  readPublishConfig,
  type WorkspacePackage,
} from "./workspace.ts";

/** What `stagePackage` produced. */
export type StagedPackage = {
  /** The folder to hand to `npm publish`. */
  directory: string;
  name: string;
  version: string;
};

/**
 * Builds the publishable copy of a workspace package into `outputDirectory`
 * (default `<package>/dist/package`).
 *
 * The compiler emits the package's `halonic.publish.entry` and every
 * workspace package it imports into one tree, imports of those packages
 * become relative paths, imports of an aliased entry become imports of its
 * published package (its files are left out), and the manifest is written
 * from `halonic.publish`. It fails when the result imports anything the
 * manifest doesn't declare, so a tarball can never depend on a private
 * workspace package.
 */
export function stagePackage(
  root: string,
  packageDirectory: string,
  outputDirectory = join(packageDirectory, "dist/package"),
): StagedPackage {
  const manifest = readJson(join(packageDirectory, "package.json"));
  const config = readPublishConfig(manifest);
  const version = String(manifest["version"] ?? "");
  const entry = describePackage(packageDirectory).entries.get(config.entry);
  if (entry === undefined) {
    throw new Error(
      `${config.name}: halonic.publish.entry "${config.entry}" is not in the package's exports.`,
    );
  }
  const workspace = findWorkspacePackages(root);
  requireMatchingVersions(version, config, workspace);
  const directory = outputDirectory;
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });

  const packagesRoot = join(root, "packages");
  const distribution = join(directory, "dist");
  emit({ packageDirectory, entry, workspace, packagesRoot, outDir: distribution });
  rewriteImports(distribution, workspace, packagesRoot, config);
  requireDeclaredImports(distribution, config);
  writeManifest(directory, manifest, config, version, {
    entry: relative(packagesRoot, entry),
    repositoryDirectory: relative(root, packageDirectory).split(sep).join("/"),
  });
  for (const name of ["LICENSE", "NOTICE"]) copyFileSync(join(root, name), join(directory, name));
  copyFileSync(join(packageDirectory, "README.md"), join(directory, "README.md"));
  return { directory, name: config.name, version };
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
      paths[join(workspacePackage.name, subpath)] = [file];
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
 * `.js`. An import of an aliased entry becomes its published name instead,
 * and the emitted copy of that entry's folder is removed, so the tarball
 * holds no second copy of the published package.
 */
function rewriteImports(
  distribution: string,
  workspace: WorkspacePackage[],
  packagesRoot: string,
  config: PublishConfig,
): void {
  const emittedPath = (source: string) => join(distribution, relative(packagesRoot, source));
  const targets = new Map<string, string>();
  for (const workspacePackage of workspace) {
    for (const [subpath, file] of workspacePackage.entries) {
      targets.set(join(workspacePackage.name, subpath), moduleOf(emittedPath(file)));
    }
  }
  const aliasedModules = new Map<string, string>();
  for (const [specifier, publishedName] of Object.entries(config.aliases)) {
    const target = targets.get(specifier);
    if (target === undefined) {
      throw new Error(`${config.name}: the alias "${specifier}" is no workspace package entry.`);
    }
    aliasedModules.set(target, publishedName);
  }
  const aliasedFolders = [...aliasedModules.keys()].map((module) => dirname(module));

  for (const file of emittedFiles(distribution)) {
    if (aliasedFolders.some((folder) => isInside(folder, file))) continue;
    const original = readFileSync(file, "utf8");
    const rewritten = rewriteSpecifiers(original, (specifier) => {
      const target = specifier.startsWith(".")
        ? moduleOf(resolve(dirname(file), specifier))
        : targets.get(specifier);
      if (target === undefined) return undefined;
      const publishedName = aliasedModules.get(target);
      if (publishedName !== undefined) return publishedName;
      if (aliasedFolders.some((folder) => isInside(folder, target))) {
        throw new Error(
          `${relative(distribution, file)} imports "${specifier}" from inside an aliased entry. Import the entry itself, so the published package is used.`,
        );
      }
      const path = `${relative(dirname(file), target).split(sep).join("/")}.js`;
      return path.startsWith(".") ? path : `./${path}`;
    });
    if (rewritten !== original) writeFileSync(file, rewritten);
  }
  for (const folder of aliasedFolders) rmSync(folder, { recursive: true, force: true });
}

/** Throws when a compiled file imports a package the manifest config does not declare. */
export function requireDeclaredImports(distribution: string, config: PublishConfig): void {
  const declared = new Set([
    ...Object.keys(config.dependencies),
    ...Object.keys(config.peerDependencies),
  ]);
  for (const file of emittedFiles(distribution)) {
    rewriteSpecifiers(readFileSync(file, "utf8"), (specifier) => {
      const name = packageOf(specifier);
      if (name !== undefined && !declared.has(name)) {
        throw new Error(
          `${relative(distribution, file)} imports "${specifier}", which ${config.name} does not declare. Bundle it (a workspace package) or add it to halonic.publish.dependencies.`,
        );
      }
      return undefined;
    });
  }
}

function writeManifest(
  directory: string,
  source: Record<string, unknown>,
  config: PublishConfig,
  version: string,
  paths: { entry: string; repositoryDirectory: string },
): void {
  const base = `./dist/${paths.entry.replace(/\.ts$/, "")}`;
  const manifest = {
    name: config.name,
    version,
    description: config.description ?? source["description"],
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/halonic-com/halonic.git",
      directory: paths.repositoryDirectory,
    },
    type: "module",
    sideEffects: false,
    exports: { ".": { types: `${base}.d.ts`, default: `${base}.js` } },
    files: ["dist", "README.md", "LICENSE", "NOTICE"],
    dependencies: config.dependencies,
    peerDependencies: config.peerDependencies,
    publishConfig: { access: "public", provenance: true },
  };
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Resolves a package folder given on the command line against the working directory. */
export function resolveFolder(folder: string): string {
  return resolve(folder);
}
