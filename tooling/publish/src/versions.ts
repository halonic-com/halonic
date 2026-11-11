import type { LayerConfig } from "./workspace.ts";

const exactVersion = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Throws unless the layer package's dependencies are exact versions and
 * every layer package of ours it imports has the same version as this one
 * and is pinned to exactly that version. The adapters and the testing
 * package always ship together, so a conformance suite can never run with
 * a kit it wasn't built against.
 *
 * @example
 * // @halonicjs/testing is 0.2.0, @halonicjs/adapters is 0.1.0:
 * requireMatchingVersions(testing, ["@halonicjs/adapters"], layers);
 * // Error: @halonicjs/testing is 0.2.0 but @halonicjs/adapters is 0.1.0 …
 */
export function requireMatchingVersions(
  config: LayerConfig,
  imported: Iterable<string>,
  layers: readonly LayerConfig[],
): void {
  for (const [name, range] of Object.entries(config.dependencies)) {
    if (!exactVersion.test(range)) {
      throw new Error(
        `${config.name} depends on ${name} "${range}". Published dependencies are exact versions, such as "1.2.3".`,
      );
    }
  }
  for (const name of new Set(imported)) {
    const other = layers.find((candidate) => candidate.name === name);
    if (other === undefined) {
      throw new Error(`${config.name} imports ${name}, but no layer package publishes it.`);
    }
    if (other.version !== config.version) {
      throw new Error(
        `${config.name} is ${config.version} but ${name} is ${other.version}. They ship together, so give both the same version.`,
      );
    }
    if (config.dependencies[name] !== config.version) {
      throw new Error(
        `${config.name} must depend on ${name} "${config.version}" exactly, not "${config.dependencies[name] ?? "(missing)"}".`,
      );
    }
  }
}
