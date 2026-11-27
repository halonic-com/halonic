import type { CloudRuntime } from "./bundle.ts";
import { type ApprovedImage, parseImages } from "./image-list.ts";
import { type Layer, layers } from "./layout.ts";
import { Place } from "./place.ts";

/**
 * Reads `policy.json` and `dependencies.json` strictly. A typo there must
 * fail the check, not quietly turn a limit into `undefined` and a rule
 * into one that always passes.
 */

/**
 * What an entry in `dependencies.json` is for. `core-exception`
 * is a library the user approved for named core packages.
 */
export const dependencyCategories = [
  "core-exception",
  "outside-world",
  "studio-framework",
  "dev-tooling",
] as const;

/** One of the dependency categories. */
export type DependencyCategory = (typeof dependencyCategories)[number];

/** One approved external dependency. */
export interface ApprovedDependency {
  readonly category: DependencyCategory;
  /** Package names; `*` matches any text. */
  readonly allowedIn: readonly string[];
  /** The layers it may be used in, on top of the names. */
  readonly layers: readonly Layer[];
  readonly reason: string;
  /** What other packages use instead, e.g. "@halonicjs/schema-kit for validation". */
  readonly useInstead?: string;
  /**
   * May ship inside a cloud runtime bundle. Only `zod`, by
   * the user's decision of 8 Nov 2026; each addition needs their approval.
   */
  readonly cloudRuntime?: boolean;
  /**
   * For dev tooling only: the one adapter that may list it in `dependencies`
   * and ship it, such as the TypeScript JS API until TypeScript 7.1 ships its
   * own. Every other package keeps it in devDependencies.
   */
  readonly runtimeIn?: string;
}

/** The contents of `tooling/check/dependencies.json`. */
export interface DependencyList {
  readonly dependencies: Readonly<Record<string, ApprovedDependency>>;
  /** What each Dockerfile may put in its image, keyed by its path from the repo root; empty when there is no `images` section. */
  readonly images: Readonly<Record<string, ApprovedImage>>;
}

/** The contents of `tooling/check/policy.json`. */
export interface Policy {
  readonly coreOrder: readonly string[];
  /**
   * The API types packages: core packages that use only each other, so
   * Studio, the CLI and outside callers can use them without the engine.
   * Empty when `policy.json` has none.
   */
  readonly apiTypes: readonly string[];
  readonly published: readonly string[];
  readonly adapterGateways: readonly string[];
  /**
   * Tooling packages that may also use core packages, such as the Agent
   * tools plugin, whose workflow host runs on our own engine (HAL-18009).
   * Empty when `policy.json` has none.
   */
  readonly toolingUsesCore: readonly string[];
  /**
   * Subpath exports a package may have besides `.` (and `./api` for a
   * feature), by package name. Empty when `policy.json` has none.
   */
  readonly extraExports: Readonly<Record<string, readonly string[]>>;
  /** Per cloud target, what the provider supplies itself. */
  readonly cloudRuntimes: Readonly<Record<string, CloudRuntime>>;
  readonly fileSize: {
    readonly warnLines: number;
    readonly maxLines: number;
    readonly warnFunctionLines: number;
  };
}

/**
 * Checks the shape of `policy.json`.
 *
 * @throws naming the file and the field when a field is missing, unknown or of the wrong type
 */
export function parsePolicy(path: string, value: unknown): Policy {
  const at = new Place(path);
  const policy = at.object(
    value,
    "",
    ["coreOrder", "published", "adapterGateways", "cloudRuntimes", "fileSize"],
    ["apiTypes", "toolingUsesCore", "extraExports"],
  );
  const fileSize = at.object(policy["fileSize"], "fileSize", [
    "warnLines",
    "maxLines",
    "warnFunctionLines",
  ]);
  return {
    coreOrder: at.strings(policy["coreOrder"], "coreOrder"),
    apiTypes: policy["apiTypes"] === undefined ? [] : at.strings(policy["apiTypes"], "apiTypes"),
    published: at.strings(policy["published"], "published"),
    adapterGateways: at.strings(policy["adapterGateways"], "adapterGateways"),
    toolingUsesCore:
      policy["toolingUsesCore"] === undefined
        ? []
        : at.strings(policy["toolingUsesCore"], "toolingUsesCore"),
    extraExports:
      policy["extraExports"] === undefined ? {} : parseExtraExports(at, policy["extraExports"]),
    cloudRuntimes: parseCloudRuntimes(at, policy["cloudRuntimes"]),
    fileSize: {
      warnLines: at.count(fileSize["warnLines"], "fileSize.warnLines"),
      maxLines: at.count(fileSize["maxLines"], "fileSize.maxLines"),
      warnFunctionLines: at.count(fileSize["warnFunctionLines"], "fileSize.warnFunctionLines"),
    },
  };
}

/** A subpath `extraExports` may allow: `./` and lower-case words, no wildcards. */
const extraExportKey = /^\.\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseExtraExports(at: Place, value: unknown): Record<string, readonly string[]> {
  const entries = at.object(value, "extraExports", undefined);
  // Built with fromEntries, so a "__proto__" entry stays an entry and is reported.
  const extra: [string, readonly string[]][] = [];
  for (const [name, raw] of Object.entries(entries)) {
    const field = `extraExports["${name}"]`;
    const keys = at.strings(raw, field, true);
    keys.forEach((key, index) => {
      if (!extraExportKey.test(key) || key === "./api") {
        at.fail(
          `${field}[${index}]`,
          'must be "./" and lower-case words joined by "-", such as "./recording", and not "./api"',
        );
      }
      if (keys.indexOf(key) !== index) {
        at.fail(`${field}[${index}]`, `repeats "${key}"`);
      }
    });
    extra.push([name, keys]);
  }
  return Object.fromEntries(extra);
}

function parseCloudRuntimes(at: Place, value: unknown): Record<string, CloudRuntime> {
  const targets = at.object(value, "cloudRuntimes", undefined);
  const runtimes: Record<string, CloudRuntime> = {};
  for (const [name, raw] of Object.entries(targets)) {
    const field = `cloudRuntimes["${name}"]`;
    const target = at.object(raw, field, ["providerPackages", "providerModules"]);
    runtimes[name] = {
      providerPackages: at.strings(target["providerPackages"], `${field}.providerPackages`),
      providerModules: at.strings(target["providerModules"], `${field}.providerModules`),
    };
  }
  return runtimes;
}

/**
 * Checks the shape of `dependencies.json`.
 *
 * @throws naming the file and the entry when a field is missing, unknown or of the wrong type
 */
export function parseDependencyList(path: string, value: unknown): DependencyList {
  const at = new Place(path);
  const list = at.object(value, "", ["dependencies"], ["images"]);
  const entries = at.object(list["dependencies"], "dependencies", undefined);
  const dependencies: Record<string, ApprovedDependency> = {};
  for (const [name, raw] of Object.entries(entries)) {
    const field = `dependencies["${name}"]`;
    const entry = at.object(
      raw,
      field,
      ["category", "allowedIn", "layers", "reason"],
      ["useInstead", "cloudRuntime", "runtimeIn"],
    );
    const reason = at.text(entry["reason"], `${field}.reason`);
    dependencies[name] = {
      ...(entry["useInstead"] === undefined
        ? {}
        : { useInstead: at.text(entry["useInstead"], `${field}.useInstead`) }),
      ...(entry["cloudRuntime"] === undefined
        ? {}
        : { cloudRuntime: at.flag(entry["cloudRuntime"], `${field}.cloudRuntime`) }),
      ...(entry["runtimeIn"] === undefined
        ? {}
        : { runtimeIn: at.text(entry["runtimeIn"], `${field}.runtimeIn`) }),
      category: at.oneOf(entry["category"], `${field}.category`, dependencyCategories),
      allowedIn: at.strings(entry["allowedIn"], `${field}.allowedIn`, true),
      layers: at
        .strings(entry["layers"], `${field}.layers`, true)
        .map((layer, index) => at.oneOf(layer, `${field}.layers[${index}]`, layers)),
      reason,
    };
  }
  const images = list["images"] === undefined ? {} : parseImages(at, list["images"]);
  return { dependencies, images };
}
