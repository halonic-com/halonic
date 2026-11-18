import { posix } from "node:path";

/** The name of Halonic's WSL distro (`wsl --import halonic …`). */
export const WSL_DISTRO = "halonic";

/** Where a project's files live: inside the distro, or on the Windows drive. */
export type WslProjectLocation = "distro" | "windows-drive";

// From parts, so the repo's check for one machine's home folder doesn't read the distro's fixed one as such.
const distroHome = posix.join("/home", "halonic");
const projectsFolder = posix.join(distroHome, "projects");
const mountsFolder = "/mnt/halonic";

/**
 * Checks a project's folder name: one plain name, so it can't reach out of
 * `projects` or `/mnt/halonic` and can't be read as a Windows path or option.
 *
 * @throws when the name is empty, long, `.`/`..`, has a separator, a control character or a Windows-reserved character, starts with `-`, or is an import mount's name (`import-` and 32 hex digits)
 */
export function assertProjectName(name: string): void {
  const problem = projectNameProblem(name);
  if (problem !== undefined) throw new Error(`the project name ${JSON.stringify(name)} ${problem}`);
}

function projectNameProblem(name: string): string | undefined {
  if (name.length === 0) return "is empty";
  if (name.length > 100) return "is longer than 100 characters";
  if (name === "." || name === "..") return "isn't a folder name";
  if (name.startsWith("-")) return "starts with a dash";
  if (name.endsWith(".") || name.endsWith(" ")) return "ends with a dot or a space";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this rejects
  if (/[/\\:*?"<>|\u0000-\u001f]/.test(name)) return "has a character a folder name can't have";
  // the updater's import mounts in /mnt/halonic have these names, and its clean-up removes them
  if (/^import-[0-9a-f]{32}$/.test(name)) return "is kept for import mounts";
  return undefined;
}

/**
 * The Linux path of a project in the distro: its `projects` folder in the
 * `halonic` user's home for a project that lives in the distro,
 * `/mnt/halonic/<name>` for one on the Windows drive (mounted alone while
 * it's open).
 *
 * @throws when the name isn't a plain folder name
 */
export function wslProjectFolder(location: WslProjectLocation, name: string): string {
  assertProjectName(name);
  return posix.join(location === "distro" ? projectsFolder : mountsFolder, name);
}

/**
 * The Windows path of a Linux path in the distro, for "Open in Explorer" and
 * "Open in VS Code": the path on the distro's WSL share, `halonic` first.
 *
 * @throws when the path isn't absolute, isn't normalised or reaches out of the root, or when the distro name isn't a plain name
 */
export function wslWindowsPath(linuxPath: string, distro: string = WSL_DISTRO): string {
  assertProjectName(distro);
  const path = linuxPath.length > 1 ? linuxPath.replace(/\/$/, "") : linuxPath;
  if (!path.startsWith("/") || posix.normalize(path) !== path)
    throw new Error(`the path ${JSON.stringify(linuxPath)} isn't an absolute, normalised path`);
  if (linuxPath.includes("\\"))
    throw new Error(`the path ${JSON.stringify(linuxPath)} has a backslash`);
  const rest = path === "/" ? "" : path.replaceAll("/", "\\");
  return `\\\\${["wsl.localhost", distro].join("\\")}${rest}`;
}
