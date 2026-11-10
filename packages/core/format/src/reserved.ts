import { segmentAsOpened } from "@halonicjs/ports";

/**
 * The folder Halonic keeps for its own data inside a workspace and inside
 * each hub: install records, staging and change sets. It holds no workspace
 * files, so the loader skips it without a warning (format.reserved-folder).
 */
export const RESERVED_FOLDER = ".halonic";

/**
 * Whether a workspace-relative path (with `/` separators) sits in the
 * reserved `.halonic/` folder of the workspace root or of a hub. Names
 * compare the way Windows and macOS open them, as `segmentAsOpened` gives
 * them: case folded, without trailing dots and spaces and without the code
 * points HFS+ ignores. So `.Halonic./x` and `HUBS/billing/.HALONIC/x` are
 * reserved too, since they open the same folder.
 *
 * @example
 * isReservedPath("hubs/billing/.halonic/source.json"); // true
 * isReservedPath(".Halonic./staging/abc/hub.yaml"); // true
 * isReservedPath("hubs/billing/agents/clerk.agent.yaml"); // false
 */
export function isReservedPath(path: string): boolean {
  const [first = "", hub = "", inHub = ""] = path.split("/");
  if (opensAsReservedFolder(first)) {
    return true;
  }
  return segmentAsOpened(first) === "hubs" && hub !== "" && opensAsReservedFolder(inHub);
}

function opensAsReservedFolder(segment: string): boolean {
  return segmentAsOpened(segment) === RESERVED_FOLDER;
}
