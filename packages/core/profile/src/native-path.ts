// Paths in the form the person's system writes them: `\` on Windows, `/`
// elsewhere. The core can't import node:path, and the Studio's web view has
// no path module at all, so the profile's few joins are done here.

/** The systems Halonic keeps a profile on. `linux` covers every other Unix-like system too. */
export type ProfilePlatform = "windows" | "macos" | "linux";

/**
 * The separator a platform writes between folders.
 *
 * @param platform - the system
 * @returns `\` on Windows, `/` elsewhere
 */
export function separatorOf(platform: ProfilePlatform): "\\" | "/" {
  return platform === "windows" ? "\\" : "/";
}

/**
 * Whether a path starts at a root: `/` on macOS and Linux; a drive (`C:\`)
 * or a network share (`\\server\share`) on Windows. A Windows path with
 * only a drive letter (`C:halonic`) is relative to that drive's current
 * folder, so it doesn't count.
 *
 * @param platform - the system the path belongs to
 * @param path - the path
 * @returns whether it is absolute
 */
export function isAbsolutePath(platform: ProfilePlatform, path: string): boolean {
  if (platform !== "windows") {
    return path.startsWith("/");
  }
  return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]{2}[^\\/]/.test(path);
}

/**
 * Joins a folder and names below it with the platform's separator. Trailing
 * separators on the folder are dropped, so `/srv/acme/` and `/srv/acme` give
 * the same result; a root such as `/` or `C:\` keeps its own.
 *
 * @param platform - the system the folder belongs to
 * @param folder - an absolute folder
 * @param names - single folder or file names, none containing a separator
 * @returns the joined path
 *
 * @example
 * joinPath("linux", "/srv/acme/", "halonic", "runs"); // "/srv/acme/halonic/runs"
 */
export function joinPath(
  platform: ProfilePlatform,
  folder: string,
  ...names: readonly string[]
): string {
  const separator = separatorOf(platform);
  const base = withoutTrailingSeparators(platform, folder);
  const glue = base.endsWith(separator) ? "" : separator;
  return names.length === 0 ? base : `${base}${glue}${names.join(separator)}`;
}

/**
 * A folder without the separators at its end, except a root's own: `/`
 * stays `/`, and `C:\` stays `C:\`.
 *
 * @param platform - the system the folder belongs to
 * @param folder - the folder
 * @returns the folder without trailing separators
 */
export function withoutTrailingSeparators(platform: ProfilePlatform, folder: string): string {
  const separators = platform === "windows" ? ["\\", "/"] : ["/"];
  let end = folder.length;
  while (end > 1 && separators.includes(folder[end - 1] ?? "")) {
    end--;
  }
  const trimmed = folder.slice(0, end);
  if (platform === "windows" && /^[A-Za-z]:$/.test(trimmed)) {
    return `${trimmed}\\`;
  }
  return trimmed;
}
