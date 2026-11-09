import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { packageOf, rewriteSpecifiers } from "./specifiers.ts";
import {
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
 * The compiler emits the package and every workspace package it imports
 * into one tree, imports of those packages become relative paths, and the
 * manifest is written from `halonic.publish`. It fails when the result
 * imports anything the manifest doesn't declare, so a tarball can never
 * depend on a private workspace package.
 */
export function stagePackage(
  root: string,
  packageDirectory: string,
  outputDirectory = join(packageDirectory, "dist/package"),
): StagedPackage {
  const manifest = readJson(join(packageDirectory, "package.json"));
  const config = readPublishConfig(manifest);
  const version = String(manifest["version"] ?? "");
  const entry = join(packageDirectory, "src/index.ts");
  const workspace = findWorkspacePackages(root);
  const bundled = workspace.filter((candidate) => !(candidate.name in config.aliases));
  const directory = outputDirectory;
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });

  const packagesRoot = join(root, "packages");
  emit({ packageDirectory, entry, bundled, packagesRoot, outDir: join(directory, "dist") });
  rewriteImports(join(directory, "dist"), bundled, packagesRoot, config);
  requireDeclaredImports(join(directory, "dist"), config);
  writeManifest(directory, manifest, config, version, relative(packagesRoot, entry));
  for (const name of ["LICENSE", "NOTICE"]) copyFileSync(join(root, name), join(directory, name));
  copyFileSync(join(packageDirectory, "README.md"), join(directory, "README.md"));
  return { directory, name: config.name, version };
}

function emit(options: {
  packageDirectory: string;
  entry: string;
  bundled: WorkspacePackage[];
  packagesRoot: string;
  outDir: string;
}): void {
  const paths: Record<string, string[]> = {};
  for (const workspacePackage of options.bundled) {
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

function rewriteImports(
  distribution: string,
  bundled: WorkspacePackage[],
  packagesRoot: string,
  config: PublishConfig,
): void {
  const targets = new Map<string, string>();
  for (const workspacePackage of bundled) {
    for (const [subpath, file] of workspacePackage.entries) {
      const emitted = join(distribution, relative(packagesRoot, file)).replace(/\.ts$/, ".js");
      targets.set(join(workspacePackage.name, subpath), emitted);
    }
  }
  for (const file of emittedFiles(distribution)) {
    const original = readFileSync(file, "utf8");
    const rewritten = rewriteSpecifiers(original, (specifier) => {
      const target = targets.get(specifier);
      if (target !== undefined) {
        const path = relative(dirname(file), target);
        return path.startsWith(".") ? path : `./${path}`;
      }
      const alias = config.aliases[specifier];
      return alias ?? undefined;
    });
    if (rewritten !== original) writeFileSync(file, rewritten);
  }
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
  entry: string,
): void {
  const base = `./dist/${entry.replace(/\.ts$/, "")}`;
  const manifest = {
    name: config.name,
    version,
    description: source["description"],
    license: "Apache-2.0",
    repository: { type: "git", url: "git+https://github.com/halonic-com/halonic.git" },
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
