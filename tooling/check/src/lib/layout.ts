/**
 * Where a package sits in the repo decides its layer and its npm name.
 * Deriving both from the path means nobody has to
 * invent a name, and two packages can never end up with the same one.
 */

/** The layers, plus `tooling` for the repo's own scripts. */
export type Layer =
  | "core"
  | "adapters"
  | "host"
  | "targets"
  | "studio"
  | "apps"
  | "testing"
  | "tooling";

/** Where an adapter runs, declared as `"halonic": { "runtime" }`. */
export const adapterRuntimes = ["node", "web", "workers", "any"] as const;

/** One of the runtimes an adapter can declare. */
export type AdapterRuntime = (typeof adapterRuntimes)[number];

/** The packages a deployment target may have. */
export const targetKinds = ["runtime", "deploy", "testing"] as const;

/** One of the packages of a deployment target. */
export type TargetKind = (typeof targetKinds)[number];

/** A package under `packages/targets/<target>/<kind>`. */
export interface TargetPlace {
  /** The target's folder name, such as `node` or `cloudflare`. */
  readonly name: string;
  readonly kind: TargetKind;
}

/** What the path of a package tells us about it. */
export interface PackagePlace {
  readonly layer: Layer;
  readonly expectedName: string;
  readonly isFeature: boolean;
  /** Set for packages of a deployment target. */
  readonly target?: TargetPlace;
}

/** The npm scope of every workspace package. */
export const scope = "@halonicjs";

/** The CLI is the one package with an unscoped name. */
export const cliPackageName = "halonic";

/** Folder names are short kebab-case words: `schema-kit`, `llm-openai`. */
export const folderNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Prefixes that other layers' names start with. A core package may not use
 * them, so `packages/core/studio-feature-x` can't collide with a feature.
 */
export const reservedCorePrefixes = [
  "app-",
  "adapter-",
  "host-",
  "target-",
  "studio-",
  "testing-",
  "tooling-",
];

/**
 * Whole names a core package may not take: `@halonicjs/root` is the repo
 * root, and `@halonicjs/host` would read as the host layer.
 */
export const reservedCoreNames = ["root", "host"];

/** True when a core folder name collides with another layer's names. */
export function isReservedCoreName(folder: string): boolean {
  return (
    reservedCoreNames.includes(folder) ||
    reservedCorePrefixes.some((prefix) => folder.startsWith(prefix))
  );
}

/**
 * Works out the layer and the expected name from a package's folder,
 * relative to the repo root with forward slashes.
 *
 * @returns `undefined` when the folder is not a place where packages live
 *
 * @example
 * placeOf("packages/studio/features/agents");
 * // { layer: "studio", expectedName: "@halonicjs/studio-feature-agents", isFeature: true }
 */
export function placeOf(directory: string): PackagePlace | undefined {
  if (directory === ".") {
    return { layer: "tooling", expectedName: `${scope}/root`, isFeature: false };
  }
  const parts = directory.split("/");
  if (parts.length === 4 && parts[0] === "packages" && parts[1] === "targets") {
    return targetPlaceOf(parts[2] ?? "", parts[3] ?? "");
  }
  const name = parts.at(-1) ?? "";
  const parent = parts.slice(0, -1).join("/");
  switch (parent) {
    case "apps":
      return {
        layer: "apps",
        expectedName: name === "cli" ? cliPackageName : `${scope}/app-${name}`,
        isFeature: false,
      };
    case "packages/core":
      return { layer: "core", expectedName: `${scope}/${name}`, isFeature: false };
    case "packages/adapters":
      return { layer: "adapters", expectedName: `${scope}/adapter-${name}`, isFeature: false };
    case "packages/host":
      return { layer: "host", expectedName: `${scope}/host-${name}`, isFeature: false };
    case "packages/studio":
      return { layer: "studio", expectedName: `${scope}/studio-${name}`, isFeature: false };
    case "packages/studio/features":
      return { layer: "studio", expectedName: `${scope}/studio-feature-${name}`, isFeature: true };
    case "packages/testing":
      return { layer: "testing", expectedName: `${scope}/testing-${name}`, isFeature: false };
    case "tooling":
      return { layer: "tooling", expectedName: `${scope}/tooling-${name}`, isFeature: false };
    default:
      return undefined;
  }
}

/**
 * A target's runtime and deploy packages are in the targets layer. Its
 * `testing` package (such as `cloudflare/testing`) is dev-only, so it gets
 * the rules of the testing layer.
 */
function targetPlaceOf(target: string, kind: string): PackagePlace | undefined {
  if (!(targetKinds as readonly string[]).includes(kind)) {
    return undefined;
  }
  return {
    layer: kind === "testing" ? "testing" : "targets",
    expectedName: `${scope}/target-${target}-${kind}`,
    isFeature: false,
    target: { name: target, kind: kind as TargetKind },
  };
}

/** The folder that holds every Studio feature package. */
export const featuresDirectory = "packages/studio/features";

/** The Studio app, whose `package.json` lists every feature. */
export const studioAppDirectory = "apps/studio";

/** The npm name prefix of every Studio feature package. */
export const featureNamePrefix = `${scope}/studio-feature-`;
