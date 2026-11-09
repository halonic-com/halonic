import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** What the stager needs to know about one workspace package. */
export type WorkspacePackage = {
  name: string;
  directory: string;
  /** Subpath (`.` or `./integration`) to the TypeScript source file it points at. */
  entries: Map<string, string>;
};

/** The published form of a workspace package, set in its `halonic.publish`. */
export type PublishConfig = {
  /** The npm name, which may differ from the workspace name. */
  name: string;
  /** Workspace names that stay imports of a published package instead of being bundled. */
  aliases: Record<string, string>;
  /** Outside packages the tarball depends on, with their version ranges. */
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

function describePackage(directory: string): WorkspacePackage {
  const manifest = readJson(join(directory, "package.json"));
  const entries = new Map<string, string>();
  const exported = manifest["exports"];
  if (typeof exported === "object" && exported !== null) {
    for (const [subpath, target] of Object.entries(exported)) {
      if (typeof target === "string") entries.set(subpath, resolve(directory, target));
    }
  }
  return { name: String(manifest["name"]), directory, entries };
}

/** Reads and checks `halonic.publish` from a package manifest. */
export function readPublishConfig(manifest: Record<string, unknown>): PublishConfig {
  const halonic = manifest["halonic"] as Record<string, unknown> | undefined;
  const publish = halonic?.["publish"] as Record<string, unknown> | undefined;
  if (typeof publish?.["name"] !== "string") {
    throw new Error(
      `${String(manifest["name"])} has no "halonic.publish.name" in its package.json.`,
    );
  }
  return {
    name: publish["name"],
    aliases: (publish["aliases"] ?? {}) as Record<string, string>,
    dependencies: (publish["dependencies"] ?? {}) as Record<string, string>,
    peerDependencies: (publish["peerDependencies"] ?? {}) as Record<string, string>,
  };
}
