/**
 * Absolute local paths: folders that only exist on one person's or one
 * agent's machine. They leak who wrote the file and where, and they never
 * work anywhere else. The folder names are listed as plain words and
 * joined into patterns, so this file doesn't trip its own rule.
 */

/** The rule name, as used in reports and in the allow-list. */
export const absolutePathRule = "absolute-path";

/** Top-level folders that hold user, temp or agent data on Linux and macOS. */
const unixFolders = [
  "home",
  "Users",
  "root",
  "tmp",
  "var/tmp",
  "var/folders",
  "private/tmp",
  "private/var",
  "run/user",
  "mnt/[a-z]",
  "Volumes",
  "paperclip",
];

/**
 * Characters that, right before the slash, show the path is not absolute:
 * a URL (`example.com/home/…`), a relative path (`./tmp/…`, `~/…`), or a
 * variable or placeholder in front (`${root}/tmp/…`, `<workspace>/tmp/…`).
 */
const notAbsoluteBefore = String.raw`[\w.~$*})\]>-]`;

/**
 * Each pattern captures the root it found (such as `/home/`), which is all
 * a report shows: the rest of the path may hold a name.
 */
const pathPatterns: readonly RegExp[] = [
  // A Unix folder followed by a name: `/tmp` on its own, as in prose, is fine.
  // This also finds a Windows user folder written with forward slashes.
  new RegExp(
    String.raw`(?<!${notAbsoluteBefore}|:\/)(\/(?:${unixFolders.join("|")})\/)(?=[\w.-])`,
    "g",
  ),
  // A Windows drive path, `C:\…`, also with JSON's doubled backslashes.
  /(?<![\w\\/.[-])([A-Za-z]:\\{1,2})(?=[\w.$])/g,
  // A path into WSL from Windows.
  /(\\\\wsl(?:\$|\.localhost)\\)/gi,
];

/** The roots of the absolute local paths in a line, such as `/home/`. */
export function findAbsolutePaths(line: string): string[] {
  const roots: string[] = [];
  for (const pattern of pathPatterns) {
    for (const match of line.matchAll(pattern)) {
      roots.push(match[1] ?? "");
    }
  }
  return roots;
}
