/**
 * The folder Halonic keeps for its own data inside a workspace and inside
 * each hub: install records, staging and change sets. It holds no workspace
 * files, so the loader skips it without a warning (format.reserved-folder).
 */
export const RESERVED_FOLDER = ".halonic";

const reservedPath = /^(?:hubs\/[^/]+\/)?\.halonic(?:\/|$)/;

/**
 * Whether a workspace-relative path (with `/` separators) sits in the
 * reserved `.halonic/` folder of the workspace root or of a hub.
 *
 * @example
 * isReservedPath("hubs/billing/.halonic/source.json"); // true
 * isReservedPath("hubs/billing/agents/clerk.agent.yaml"); // false
 */
export function isReservedPath(path: string): boolean {
  return reservedPath.test(path);
}
