/**
 * Where a package sits in the repo decides its layer and its npm name
 * (plan 3.4 and 4.1). Deriving both from the path means nobody has to
 * invent a name, and two packages can never end up with the same one.
 */

/** The layers from plan 4.1, plus `tooling` for the repo's own scripts. */
export type Layer = "core" | "adapters" | "host" | "studio" | "apps" | "testing" | "tooling";

/** What the path of a package tells us about it. */
export interface PackagePlace {
  readonly layer: Layer;
  readonly expectedName: string;
  readonly isFeature: boolean;
}

/** The npm scope of every workspace package (plan 3.2). */
export const scope = "@halonicjs";

/** The CLI is the one package with an unscoped name. */
export const cliPackageName = "halonic";

/** Folder names are short kebab-case words: `schema-kit`, `llm-openai`. */
export const folderNamePattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/**
 * Prefixes that other layers' names start with. A core package may not use
 * them, so `packages/core/studio-feature-x` can't collide with a feature.
 */
export const reservedCorePrefixes = ["app-", "adapter-", "studio-", "testing-", "tooling-"];

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
  if (directory === "packages/host") {
    return { layer: "host", expectedName: `${scope}/host`, isFeature: false };
  }
  const parts = directory.split("/");
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

/** The folder that holds every Studio feature package. */
export const featuresDirectory = "packages/studio/features";

/** The Studio app, whose `package.json` lists every feature (plan 5.3). */
export const studioAppDirectory = "apps/studio";

/** The npm name prefix of every Studio feature package. */
export const featureNamePrefix = `${scope}/studio-feature-`;
