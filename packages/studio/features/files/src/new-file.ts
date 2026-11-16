/** Where the New file dialog's path starts when no folder is focused. */
export const defaultNewFilePath = "hubs/";

/**
 * The path the New file dialog starts with: the focused folder's, else `hubs/`.
 *
 * @param folder - the focused folder's path such as `hubs/p/agents`, or `undefined`
 */
export function startingPath(folder: string | undefined): string {
  return folder === undefined || folder === "" ? defaultNewFilePath : `${folder}/`;
}

/** What is wrong with a typed path before the host is asked. */
export type NewPathProblem = "missing" | "outside" | "private";

/**
 * Checks what needs no look at the folder: a name is given, the path stays inside the workspace,
 * and it isn't in the local data. Whether the file exists is for the host to say.
 *
 * @example
 * checkNewPath("hubs/"); // "missing"
 * checkNewPath("../x.yaml"); // "outside"
 */
export function checkNewPath(input: string): NewPathProblem | undefined {
  const path = input.trim();
  if (path === "" || path.endsWith("/")) return "missing";
  const parts = path.split("/");
  if (path.startsWith("/") || parts.includes("..")) return "outside";
  if (parts[0] === ".studio") return "private";
  return undefined;
}
