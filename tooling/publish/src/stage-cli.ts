import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { build } from "esbuild";

/** What `stageCli` produced. */
export type StagedCli = {
  /** The folder to hand to `npm pack`. */
  directory: string;
  name: string;
  version: string;
};

/** The package that holds the sandbox: it runs as its own program, so it can't be bundled. */
const sandboxRuntime = "@anthropic-ai/sandbox-runtime";

/**
 * Builds the publishable copy of the CLI (`apps/cli`, package `halonic`) into
 * `outputDirectory` (default `tooling/publish/dist/cli`).
 *
 * Node won't run TypeScript inside `node_modules`, so the CLI and every
 * workspace package and library it imports are bundled into `dist/cli/main.js`,
 * which imports Node's own modules only. Three things can't be bundled and
 * ship beside it, where the code looks for them: the integration runner file
 * (`dist/runner.mjs`, built first by `pnpm --filter @halonicjs/adapter-integration-runner build`),
 * the `examples` folder, and the sandbox runtime with its dependencies as
 * bundled dependencies of the package, the very copy (with our patch) the
 * workspace runs, because the sandbox starts its command line as a program.
 * `bin/halonic.js` keeps its Node version check and imports the bundle.
 *
 * @param version the version of the package and of `halonic --version`
 * @throws Error when the runner file isn't built, or the bundle imports a package that isn't Node's own
 */
export async function stageCli(
  root: string,
  version: string,
  outputDirectory?: string,
): Promise<StagedCli> {
  const cliDirectory = join(root, "apps/cli");
  const directory = outputDirectory ?? join(root, "tooling/publish/dist/cli");
  const runnerFile = join(root, "packages/adapters/integration-runner/dist/runner.mjs");
  if (!existsSync(runnerFile)) {
    throw new Error(
      "The integration runner file isn't built. Run `pnpm --filter @halonicjs/adapter-integration-runner build` first.",
    );
  }
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(join(directory, "dist/cli"), { recursive: true });
  mkdirSync(join(directory, "bin"));

  await bundleCli(cliDirectory, directory, version);

  cpSync(runnerFile, join(directory, "dist/runner.mjs"));
  cpSync(join(root, "examples"), join(directory, "examples"), { recursive: true });
  const bundled = copyBundledDependencies(root, join(directory, "node_modules"));

  const launcher = readFileSync(join(cliDirectory, "bin/halonic.js"), "utf8");
  if (!launcher.includes('"../src/main.ts"')) {
    throw new Error(
      "bin/halonic.js no longer imports ../src/main.ts, so the stager can't point it at the bundle.",
    );
  }
  writeFileSync(
    join(directory, "bin/halonic.js"),
    launcher.replace('"../src/main.ts"', '"../dist/cli/main.js"'),
  );
  cpSync(join(cliDirectory, "bin/node-floor.js"), join(directory, "bin/node-floor.js"));
  for (const name of ["LICENSE", "NOTICE"]) cpSync(join(root, name), join(directory, name));
  cpSync(join(cliDirectory, "README.md"), join(directory, "README.md"));
  writeManifest(directory, version, bundled);
  return { directory, name: "halonic", version };
}

/** Bundles `apps/cli/src/main.ts` into `dist/cli/main.js` of the staged package. */
async function bundleCli(cliDirectory: string, directory: string, version: string): Promise<void> {
  const versionFile = join(cliDirectory, "src/version.ts");
  const result = await build({
    entryPoints: [join(cliDirectory, "src/main.ts")],
    outfile: join(directory, "dist/cli/main.js"),
    absWorkingDir: cliDirectory,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node26",
    // Some bundled libraries are CommonJS and `require` Node's own modules.
    banner: {
      js: 'import { createRequire as __halonicCreateRequire } from "node:module"; const require = __halonicCreateRequire(import.meta.url);',
    },
    // Our own code, and `--version`, carry the version of this package.
    plugins: [
      {
        name: "halonic-version",
        setup(pluginBuild) {
          pluginBuild.onLoad({ filter: /version\.ts$/ }, (args) =>
            args.path === versionFile
              ? {
                  contents: `export const halonicVersion = ${JSON.stringify(version)};`,
                  loader: "ts",
                }
              : undefined,
          );
        },
      },
    ],
    metafile: true,
    legalComments: "none",
    logLevel: "silent",
  }).catch((error: unknown) => {
    throw new Error(`The CLI didn't build.\n${String(error)}`, { cause: error });
  });
  const outside = new Set<string>();
  for (const output of Object.values(result.metafile.outputs)) {
    for (const entry of output.imports) {
      if (entry.external && !isNodeModule(entry.path)) outside.add(entry.path);
    }
  }
  if (outside.size > 0) {
    throw new Error(
      `The CLI bundle imports ${[...outside].join(", ")}, which Node doesn't provide. Bundle it or declare it.`,
    );
  }
}

function isNodeModule(specifier: string): boolean {
  return specifier.startsWith("node:") || builtinModules.includes(specifier);
}

type PackageJson = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

/** The `package.json` of `name` as Node finds it from `fromDirectory`: the nearest `node_modules` that has it. */
function findManifest(name: string, fromDirectory: string): string {
  for (let folder = fromDirectory; ; folder = dirname(folder)) {
    const candidate = join(folder, "node_modules", name, "package.json");
    if (existsSync(candidate)) return realpathSync(candidate);
    if (dirname(folder) === folder)
      throw new Error(`${name} isn't installed for ${fromDirectory}.`);
  }
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
}

/**
 * Copies the sandbox runtime as the workspace resolves it (patched), and
 * everything it needs to run, flat into `target`. Returns the package names.
 */
function copyBundledDependencies(root: string, target: string): Map<string, string> {
  const copied = new Map<string, string>();
  const visit = (name: string, fromDirectory: string): void => {
    const manifestPath = findManifest(name, fromDirectory);
    const manifest = readJson(manifestPath);
    const known = copied.get(name);
    if (known !== undefined) {
      if (known !== manifest.version) {
        throw new Error(
          `${name} is needed in two versions, ${known} and ${manifest.version}, by the sandbox runtime.`,
        );
      }
      return;
    }
    copied.set(name, manifest.version);
    cpSync(dirname(manifestPath), join(target, name), { recursive: true, dereference: true });
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      visit(dependency, dirname(manifestPath));
    }
  };
  visit(sandboxRuntime, join(root, "packages/adapters/sandbox-srt"));
  return copied;
}

function writeManifest(directory: string, version: string, bundled: Map<string, string>): void {
  const runtimeVersion = bundled.get(sandboxRuntime);
  const manifest = {
    name: "halonic",
    version,
    description: "The halonic command-line tool: set up, run and inspect Halonic workspaces.",
    license: "Apache-2.0",
    repository: {
      type: "git",
      url: "git+https://github.com/halonic-com/halonic.git",
      directory: "apps/cli",
    },
    type: "module",
    bin: { halonic: "./bin/halonic.js" },
    engines: { node: ">=26.12.0" },
    // The sandbox runtime carries our patch, so it ships inside the tarball instead of coming from npm.
    dependencies: { [sandboxRuntime]: runtimeVersion },
    bundleDependencies: [...bundled.keys()].sort(),
    files: ["bin", "dist", "examples", "node_modules", "README.md", "LICENSE", "NOTICE"],
    publishConfig: { access: "public", provenance: true },
  };
  writeFileSync(join(directory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}
