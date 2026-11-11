import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadContext } from "../lib/context.ts";
import { defaultCoverageFloors } from "../lib/coverage.ts";
import type { Layer } from "../lib/layout.ts";
import type { Problem } from "../lib/problems.ts";
import { rules, selectRules } from "../rules/all.ts";

const realRoot = join(import.meta.dirname, "..", "..", "..", "..");

/** The real allow-list, which every fixture repo starts from. */
export const realDependencyListPath = join(realRoot, "tooling/check/dependencies.json");

/** A small package for a fixture repo. */
export interface FixturePackage {
  readonly directory: string;
  readonly manifest?: Record<string, unknown>;
  readonly files?: Readonly<Record<string, string>>;
  /** Leave out the AGENTS.md the fixture otherwise writes. */
  readonly withoutAgentsMd?: boolean;
}

/** A valid package.json for a folder, which tests then break on purpose. */
export function manifestFor(
  name: string,
  layer: Layer,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    private: true,
    type: "module",
    exports: { ".": "./src/index.ts" },
    scripts: { test: "vitest run" },
    halonic: { layer, owner: "mateo", coverage: defaultCoverageFloors[layer] },
    ...extra,
  };
}

/** A valid AGENTS.md for a fixture package, so only the AGENTS.md tests have to think about it. */
function agentsMdFor(pkg: FixturePackage): string {
  const { owner, layer } = (pkg.manifest?.["halonic"] ?? {}) as { owner?: string; layer?: string };
  return `# ${pkg.directory}\n\nOwner: ${owner} · Layer: ${layer} · Read the root \`AGENTS.md\` first.\n\n## Scope\n\nA fixture.\n`;
}

/** What a fixture repo holds besides its packages. */
export interface FixtureOptions {
  readonly coreOrder?: string[];
  readonly extraFiles?: Record<string, string>;
  /** Entries added to the real dependencies.json. */
  readonly extraDependencies?: Record<string, unknown>;
  /** Changes the real dependencies.json (the whole parsed file) before it is written. */
  readonly editDependencyList?: (list: { dependencies: Record<string, unknown> }) => unknown;
  /** Changes the real policy.json (with `coreOrder` set, `apiTypes` and `extraExports` empty) before it is written. */
  readonly policy?: (policy: Record<string, unknown>) => unknown;
  /** Changes the real pnpm-workspace.yaml before it is written. */
  readonly workspaceYaml?: (yaml: string) => string;
  /** The text of `overrides-allowed.json`; the real file when absent. */
  readonly overridesAllowed?: string;
  /** The text of `patches-allowed.json`; the real file when absent. */
  readonly patchesAllowed?: string;
  /** The rules to run. Without it, the ones a plain `pnpm check` runs, so not `trace`. */
  readonly rules?: readonly string[];
}

/**
 * Builds a throwaway git repo with the real workspace globs and check
 * policy. The caller removes it with `removeFixtureRepo`.
 */
export function writeFixtureRepo(
  packages: readonly FixturePackage[],
  options: FixtureOptions = {},
): string {
  const root = mkdtempSync(join(tmpdir(), "halonic-check-"));
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const yaml = readFileSync(join(realRoot, "pnpm-workspace.yaml"), "utf8");
  write("pnpm-workspace.yaml", options.workspaceYaml?.(yaml) ?? yaml);
  write(
    "pnpm-lock.yaml",
    "lockfileVersion: '9.0'\n\npackages:\n\n  a@1.0.0:\n    resolution: {integrity: sha512-AAAA, tarball: https://registry.npmjs.org/a/-/a-1.0.0.tgz}\n",
  );
  const policy = fixturePolicy(options.coreOrder ?? []);
  write("tooling/check/policy.json", JSON.stringify(options.policy?.(policy) ?? policy));
  const dependencyList = JSON.parse(readFileSync(realDependencyListPath, "utf8"));
  const list = {
    ...dependencyList,
    dependencies: {
      ...dependencyList.dependencies,
      ...options.extraDependencies,
    },
  };
  write(
    "tooling/check/dependencies.json",
    JSON.stringify(options.editDependencyList?.(list) ?? list),
  );
  write(
    "tooling/check/advisories-ignored.json",
    readFileSync(join(realRoot, "tooling/check/advisories-ignored.json"), "utf8"),
  );
  writeTreeRewriteLists(write, options);
  // Empty, because the real list names files that a fixture repo doesn't have.
  write("tooling/check/process-starters.json", JSON.stringify({ starters: {} }));
  write(
    "package.json",
    JSON.stringify(manifestFor("@halonicjs/root", "tooling", { exports: undefined })),
  );
  for (const pkg of packages) {
    write(`${pkg.directory}/package.json`, JSON.stringify(pkg.manifest ?? {}));
    const files = pkg.files ?? { "src/index.ts": "export const x = 1;\n" };
    for (const [file, text] of Object.entries({
      ...(pkg.withoutAgentsMd ? {} : { "AGENTS.md": agentsMdFor(pkg) }),
      "vitest.config.ts": "export default definePackageTestConfig();\n",
      ...files,
    })) {
      write(`${pkg.directory}/${file}`, text);
    }
  }
  for (const [file, text] of Object.entries(options.extraFiles ?? {})) {
    write(file, text);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}

/** The allow-lists for `overrides:` and `patchedDependencies:`: the fixture's own text, or the real files. */
function writeTreeRewriteLists(
  write: (path: string, text: string) => void,
  options: FixtureOptions,
): void {
  const real = (file: string): string => readFileSync(join(realRoot, file), "utf8");
  const overrides = "tooling/check/overrides-allowed.json";
  write(overrides, options.overridesAllowed ?? real(overrides));
  const patches = "tooling/check/patches-allowed.json";
  write(patches, options.patchesAllowed ?? real(patches));
}

/** The real policy.json with `coreOrder` set, for a fixture repo. */
function fixturePolicy(coreOrder: string[]): Record<string, unknown> {
  const realPolicy = JSON.parse(readFileSync(join(realRoot, "tooling/check/policy.json"), "utf8"));
  // The real apiTypes and extraExports name real packages, which a fixture may not have.
  return { ...realPolicy, coreOrder, apiTypes: [], extraExports: {} };
}

/** Removes a repo from `writeFixtureRepo`. */
export function removeFixtureRepo(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/** Builds a fixture repo, runs every rule on it and returns the errors. */
export function runChecks(
  packages: readonly FixturePackage[],
  options: FixtureOptions = {},
): Problem[] {
  const root = writeFixtureRepo(packages, options);
  try {
    const context = loadContext(root);
    return selectRules(options.rules ?? [])
      .flatMap((name) => rules[name]?.(context).problems ?? [])
      .filter((problem) => problem.severity === "error");
  } finally {
    removeFixtureRepo(root);
  }
}

/** Two core packages, format using std, in that core order. */
export const std: FixturePackage = {
  directory: "packages/core/std",
  manifest: manifestFor("@halonicjs/std", "core"),
};
export const format: FixturePackage = {
  directory: "packages/core/format",
  manifest: manifestFor("@halonicjs/format", "core", {
    dependencies: { "@halonicjs/std": "workspace:*" },
  }),
  files: { "src/index.ts": 'import { x } from "@halonicjs/std";\nexport const y = x;\n' },
};
export const coreOrder = ["@halonicjs/std", "@halonicjs/format"];

/** An empty Studio feature, which tests then change. */
export function feature(
  name: string,
  extra: Record<string, unknown> = {},
  files?: Record<string, string>,
): FixturePackage {
  return {
    directory: `packages/studio/features/${name}`,
    manifest: manifestFor(`@halonicjs/studio-feature-${name}`, "studio", {
      exports: { ".": "./src/index.ts", "./api": "./src/api.ts" },
      ...extra,
    }),
    files: files ?? { "src/index.ts": "export const f = 1;\n", "src/api.ts": "export {};\n" },
  };
}

/** The Studio app listing these features. */
export function studioApp(features: string[]): FixturePackage {
  return {
    directory: "apps/studio",
    manifest: manifestFor("@halonicjs/app-studio", "apps", {
      exports: undefined,
      dependencies: Object.fromEntries(
        features.map((name) => [`@halonicjs/studio-feature-${name}`, "workspace:*"]),
      ),
    }),
  };
}

/** The names of the rules that report an error for these packages. */
export function rulesHit(
  packages: FixturePackage[],
  options?: Parameters<typeof runChecks>[1],
): string[] {
  return [...new Set(runChecks(packages, options).map((problem) => problem.rule))].sort();
}
