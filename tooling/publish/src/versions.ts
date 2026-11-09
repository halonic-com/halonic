import type { PublishConfig, WorkspacePackage } from "./workspace.ts";

const exactVersion = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

/**
 * Throws unless the package's published dependencies are exact versions
 * and every published package it imports (an alias) has the same version
 * as this one and is pinned to exactly that version. The kit and the
 * conformance suite always ship together, so a suite can never run with a
 * kit it wasn't built against.
 *
 * @example
 * // The suite is 0.2.0, the kit is 0.1.0:
 * requireMatchingVersions("0.2.0", suiteConfig, workspace);
 * // Error: @halonicjs/testing-integration is 0.2.0 but @halonicjs/integration-kit is 0.1.0 …
 */
export function requireMatchingVersions(
  version: string,
  config: PublishConfig,
  workspace: readonly WorkspacePackage[],
): void {
  for (const [name, range] of Object.entries(config.dependencies)) {
    if (!exactVersion.test(range)) {
      throw new Error(
        `${config.name} depends on ${name} "${range}". Published dependencies are exact versions, such as "1.2.3".`,
      );
    }
  }
  for (const publishedName of new Set(Object.values(config.aliases))) {
    const publisher = workspace.find((candidate) => candidate.publishedName === publishedName);
    if (publisher === undefined) {
      throw new Error(
        `${config.name} imports ${publishedName}, but no workspace package publishes it.`,
      );
    }
    if (publisher.version !== version) {
      throw new Error(
        `${config.name} is ${version} but ${publishedName} is ${publisher.version}. They ship together, so give both the same version.`,
      );
    }
    if (config.dependencies[publishedName] !== version) {
      throw new Error(
        `${config.name} must depend on ${publishedName} "${version}" exactly, not "${config.dependencies[publishedName] ?? "(missing)"}".`,
      );
    }
  }
}
