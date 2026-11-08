import { type DependencyList, listInWords, matchesNamePattern } from "./context.ts";
import { type Problem, Report } from "./problems.ts";

/**
 * The part of an esbuild metafile the bundle check reads. Wrangler and our
 * own runtime builds both write one (`--metafile`).
 */
export interface Metafile {
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly outputs: Readonly<
    Record<string, { readonly imports?: readonly MetafileImport[] | undefined }>
  >;
}

interface MetafileImport {
  readonly path: string;
  readonly external?: boolean | undefined;
}

/** What a cloud provider brings itself, from `cloudRuntimes` in `policy.json`. */
export interface CloudRuntime {
  /** npm packages that are the provider's own code, e.g. `wrangler`'s templates. */
  readonly providerPackages: readonly string[];
  /** Module names the provider's runtime supplies, e.g. `cloudflare:*`. */
  readonly providerModules: readonly string[];
}

/** Everything the bundle check compares a metafile against. */
export interface BundleRules {
  readonly target: string;
  readonly runtime: CloudRuntime;
  readonly dependencyList: DependencyList;
  /** Names of our own workspace packages. */
  readonly workspacePackages: ReadonlySet<string>;
}

const rule = "cloud-bundle";
const guide = "See docs/guides/dependencies.md.";

/**
 * Checks a built cloud runtime bundle: it may hold
 * only our own code, the provider's own code and the libraries marked
 * `cloudRuntime` in `dependencies.json`. Reading the bundler's inputs also
 * catches whatever an approved library brings in with it.
 *
 * @example
 * checkCloudBundle(metafile, "dist/worker.meta.json", rules);
 * // [{ rule: "cloud-bundle", message: 'The cloudflare runtime bundle contains "lodash" …' }]
 */
export function checkCloudBundle(
  metafile: Metafile,
  metafilePath: string,
  rules: BundleRules,
): Problem[] {
  const report = new Report(rule);
  const reported = new Set<string>();
  for (const input of Object.keys(metafile.inputs)) {
    const name = packageOfInput(input);
    if (name !== undefined && !reported.has(name) && !isAllowedPackage(name, rules)) {
      reported.add(name);
      report.error(
        metafilePath,
        `The ${rules.target} runtime bundle contains "${name}" (from ${input}). A cloud runtime ships only our own code, the provider's own code and the libraries marked cloudRuntime in tooling/check/dependencies.json. Move the code that needs it out of the runtime, or ask for the user's approval. ${guide}`,
      );
    }
  }
  for (const external of externalImports(metafile)) {
    if (!reported.has(external) && !isProviderModule(external, rules.runtime)) {
      reported.add(external);
      report.error(
        metafilePath,
        `The ${rules.target} runtime bundle leaves "${external}" to be loaded at run time, and ${rules.target} doesn't supply it. Only ${listInWords(rules.runtime.providerModules)} may stay external.`,
      );
    }
  }
  return report.problems;
}

/**
 * The npm package an input file belongs to, or `undefined` for our own
 * source. pnpm nests packages (`node_modules/.pnpm/zod@4.1.0/node_modules/zod/…`),
 * so the last `node_modules/` decides.
 *
 * @example
 * packageOfInput("node_modules/.pnpm/a@1/node_modules/@scope/b/index.js"); // "@scope/b"
 * packageOfInput("core/format/src/index.ts"); // undefined
 */
export function packageOfInput(input: string): string | undefined {
  const marker = "node_modules/";
  const at = input.lastIndexOf(marker);
  if (at === -1) {
    return undefined;
  }
  const parts = input.slice(at + marker.length).split("/");
  const [first, second] = parts;
  if (first === undefined || first === "") {
    return undefined;
  }
  return first.startsWith("@") && second !== undefined ? `${first}/${second}` : first;
}

function isAllowedPackage(name: string, rules: BundleRules): boolean {
  if (rules.workspacePackages.has(name)) {
    return true;
  }
  if (rules.runtime.providerPackages.some((pattern) => matchesNamePattern(name, pattern))) {
    return true;
  }
  return rules.dependencyList.dependencies[name]?.cloudRuntime === true;
}

function isProviderModule(path: string, runtime: CloudRuntime): boolean {
  return runtime.providerModules.some((pattern) => matchesNamePattern(path, pattern));
}

function externalImports(metafile: Metafile): Set<string> {
  const found = new Set<string>();
  for (const output of Object.values(metafile.outputs)) {
    for (const imported of output.imports ?? []) {
      if (imported.external === true) {
        found.add(imported.path);
      }
    }
  }
  return found;
}
