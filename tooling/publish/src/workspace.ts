import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** What the stager needs to know about one workspace package. */
export type WorkspacePackage = {
  name: string;
  directory: string;
  /** Subpath (`.` or `./integration`) to the TypeScript source file it points at. */
  entries: Map<string, string>;
  /** Where the package is published, from its `halonic.publish`, for a package we publish. */
  published: PublishedEntry | undefined;
};

/**
 * A workspace package's place in a published layer package, set in its
 * `halonic.publish`: `{ "name": "@halonicjs/adapters/integration-kit",
 * "entry": "./integration" }` publishes the package's `./integration` entry
 * as the `./integration-kit` subpath of `@halonicjs/adapters`.
 */
export type PublishedEntry = {
  /** The import path on npm: the layer package's name, with a subpath unless it is the main entry. */
  name: string;
  /** The subpath of the workspace package's `exports` that is published (default `.`). */
  entry: string;
};

/**
 * One npm package per layer (HAL-5149): its name, version and manifest
 * fields, from `tooling/publish/layers/<layer>/layer.json`. Its subpaths
 * are the workspace packages of `packages/<layer>` whose `halonic.publish`
 * names it.
 */
export type LayerConfig = {
  /** The layer folder under `packages/`, such as `adapters`. */
  layer: string;
  /** The folder of `layer.json`, which also holds the README shipped to npm. */
  directory: string;
  /** The npm name, such as `@halonicjs/adapters`. */
  name: string;
  /** One version for the whole layer package. */
  version: string;
  description: string;
  /** Packages the tarball depends on, each pinned to one exact version. */
  dependencies: Record<string, string>;
  /** Packages the consumer brings, with their version ranges. */
  peerDependencies: Record<string, string>;
};

/** Reads a JSON file that is known to hold an object. */
export function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

/** Finds every workspace package under `<root>/packages/<layer>/<name>`. */
export function findWorkspacePackages(root: string): WorkspacePackage[] {
  const found: WorkspacePackage[] = [];
  const packagesDirectory = join(root, "packages");
  for (const layer of readdirSync(packagesDirectory, { withFileTypes: true })) {
    if (!layer.isDirectory()) continue;
    for (const folder of readdirSync(join(packagesDirectory, layer.name), {
      withFileTypes: true,
    })) {
      const directory = join(packagesDirectory, layer.name, folder.name);
      // A folder without a package.json holds no package.
      if (existsSync(join(directory, "package.json"))) found.push(describePackage(directory));
    }
  }
  return found;
}

/** Reads the name, the exported entries and the published entry of the package in `directory`. */
export function describePackage(directory: string): WorkspacePackage {
  const manifest = readJson(join(directory, "package.json"));
  const entries = new Map<string, string>();
  const exported = manifest["exports"];
  if (typeof exported === "object" && exported !== null) {
    for (const [subpath, target] of Object.entries(exported)) {
      if (typeof target === "string") entries.set(subpath, resolve(directory, target));
    }
  }
  const halonic = manifest["halonic"] as { publish?: Record<string, unknown> } | undefined;
  const publish = halonic?.publish;
  const published =
    typeof publish?.["name"] === "string"
      ? {
          name: publish["name"],
          entry: typeof publish["entry"] === "string" ? publish["entry"] : ".",
        }
      : undefined;
  return { name: String(manifest["name"]), directory, entries, published };
}

/** The folder that holds one `<layer>/layer.json` per published layer package. */
export function layersDirectory(root: string): string {
  return join(root, "tooling/publish/layers");
}

/** Reads every layer package under `tooling/publish/layers`. */
export function findLayers(root: string): LayerConfig[] {
  const directory = layersDirectory(root);
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readLayerConfig(join(directory, entry.name)));
}

/** Reads and checks the `layer.json` in `directory`, whose folder name is the layer. */
export function readLayerConfig(directory: string): LayerConfig {
  const layer = directory.split(/[\\/]/).at(-1) ?? "";
  const config = readJson(join(directory, "layer.json"));
  for (const field of ["name", "version", "description"]) {
    if (typeof config[field] !== "string") {
      throw new Error(`${layer}/layer.json has no "${field}".`);
    }
  }
  return {
    layer,
    directory,
    name: String(config["name"]),
    version: String(config["version"]),
    description: String(config["description"]),
    dependencies: (config["dependencies"] ?? {}) as Record<string, string>,
    peerDependencies: (config["peerDependencies"] ?? {}) as Record<string, string>,
  };
}
