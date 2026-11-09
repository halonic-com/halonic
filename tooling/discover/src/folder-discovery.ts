import {
  type CheckContext,
  folderNamePattern,
  type Problem,
  Report,
} from "@halonicjs/tooling-check";

/**
 * One set of discovered folders, declared by a package in
 * `"halonic": { "discover": { "<name>": { … } } }`. Every subfolder of
 * `folder` that has `file` becomes one entry of `src/generated/<name>.ts`.
 *
 * @example
 * // packages/core/engine/package.json
 * "discover": {
 *   "states": {
 *     "folder": "src/states",
 *     "file": "state.ts",
 *     "suffix": "State",
 *     "satisfies": { "type": "StateRegistry", "from": "src/kernel/registry.ts" }
 *   }
 * }
 * // src/states/task/state.ts exports taskState; src/generated/states.ts exports
 * // const states = { task: taskState, … } as const satisfies StateRegistry
 */
export interface FolderDiscovery {
  /** The package folder, relative to the repo root. */
  readonly packageDirectory: string;
  /** Names the generated file and its export: `states` → `src/generated/states.ts`, `states`. */
  readonly name: string;
  /** The folder whose subfolders are discovered, relative to the package. */
  readonly folder: string;
  /** The file every subfolder has; it exports `<folder in camelCase><suffix>`. */
  readonly file: string;
  /** Ends every export name: `State` makes `task` export `taskState`. */
  readonly suffix: string;
  /** A type the generated object must satisfy, so a missing or extra folder fails typecheck. */
  readonly satisfies?: { readonly type: string; readonly from: string };
}

type WorkspacePackage = CheckContext["packages"][number];

const rule = "discover";
const namePattern = folderNamePattern;
const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const suffixPattern = /^[A-Z][A-Za-z0-9]*$/;
// Paths stay inside the package's src, outside src/generated, with no "..", "//" or trailing "/".
const sourcePathPattern =
  /^src\/(?!generated(?:\/|$))(?!.*(?:\.\.|\/\/))[a-z0-9](?:[a-z0-9/._-]*[a-z0-9])?$/;
const typeScriptSourcePattern =
  /^src\/(?!generated\/)(?!.*(?:\.\.|\/\/))[a-z0-9][a-z0-9/._-]*\.ts$/;

/** Where a discovery's generated file goes, relative to the repo root. */
export function generatedFolderFile(discovery: FolderDiscovery): string {
  return `${discovery.packageDirectory}/src/generated/${discovery.name}.ts`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  fields: Record<string, unknown>,
  key: string,
  pattern: RegExp,
  complain: (message: string) => void,
): string | undefined {
  const value = fields[key];
  if (typeof value === "string" && pattern.test(value)) {
    return value;
  }
  complain(`"${key}" must be a string matching ${pattern}; it is ${JSON.stringify(value)}.`);
  return undefined;
}

function parseSatisfies(
  value: unknown,
  complain: (message: string) => void,
): FolderDiscovery["satisfies"] {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    complain(`"satisfies" must be { "type": "<type name>", "from": "src/<file>.ts" }.`);
    return undefined;
  }
  const type = stringField(value, "type", identifierPattern, complain);
  const from = stringField(value, "from", typeScriptSourcePattern, complain);
  if (type === undefined || from === undefined) {
    return undefined;
  }
  return { type, from };
}

function parseDiscovery(
  pkg: WorkspacePackage,
  name: string,
  value: unknown,
  report: Report,
): FolderDiscovery | undefined {
  let valid = true;
  const complain = (message: string): void => {
    valid = false;
    report.error(pkg.manifestPath, `halonic.discover.${name}: ${message}`);
  };
  if (!namePattern.test(name)) {
    complain(`the name must be lowercase words joined by hyphens, like "states".`);
  }
  if (!isPlainObject(value)) {
    complain(`must be { "folder", "file", "suffix" } with an optional "satisfies".`);
    return undefined;
  }
  const folder = stringField(value, "folder", sourcePathPattern, complain);
  const file = stringField(value, "file", /^[a-z0-9][a-z0-9.-]*\.ts$/, complain);
  const suffix = stringField(value, "suffix", suffixPattern, complain);
  const satisfies = parseSatisfies(value["satisfies"], complain);
  if (!valid || folder === undefined || file === undefined || suffix === undefined) {
    return undefined;
  }
  const discovery = { packageDirectory: pkg.directory, name, folder, file, suffix };
  return satisfies === undefined ? discovery : { ...discovery, satisfies };
}

/** Reads every package's folder discoveries, reporting the ones that are declared wrong. */
export function readFolderDiscoveries(context: CheckContext): {
  discoveries: FolderDiscovery[];
  problems: Problem[];
} {
  const report = new Report(rule);
  const discoveries: FolderDiscovery[] = [];
  for (const pkg of context.packages) {
    const declared = (pkg.manifest.halonic as { discover?: unknown } | undefined)?.discover;
    if (declared === undefined) {
      continue;
    }
    if (!isPlainObject(declared)) {
      report.error(pkg.manifestPath, `halonic.discover must map names to folder discoveries.`);
      continue;
    }
    for (const [name, value] of Object.entries(declared)) {
      const discovery = parseDiscovery(pkg, name, value, report);
      if (discovery !== undefined) {
        discoveries.push(discovery);
      }
    }
  }
  return { discoveries, problems: report.problems };
}
