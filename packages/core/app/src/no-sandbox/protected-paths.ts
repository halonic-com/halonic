// The files and folders in a working folder that other tools read as
// instructions or hooks. One list, two readers: the sandbox-runtime adapter
// denies writing them, and the ask policy of "no sandbox" mode asks before
// an agent edits them (HAL-5397).

/** One path in the working folder, as segments: each reader joins them its own way. */
export type PathSegments = readonly string[];

/**
 * The entries sandbox-runtime denies writing in the working folder. The
 * program may write the working folder, but not these, so it can't plant a
 * hook that runs outside the fence later.
 *
 * The list covers only what runs without the user choosing to run project
 * code. It does not cover a git repository the program creates in a subfolder
 * during the session (the ask policy does, see `isProtectedPath`), or project
 * scripts the user runs later (`npm test`, `make`, a build file).
 */
export const writeFencedPaths: readonly PathSegments[] = [
  [".claude", "settings.json"],
  [".claude", "settings.local.json"],
  [".claude", "commands"],
  [".claude", "agents"],
  [".claude", "skills"],
  [".claude", "hooks"],
  [".codex"],
  [".cursor"],
  // Shell start-up files, read when someone opens a shell in the folder.
  [".bashrc"],
  [".bash_profile"],
  [".bash_login"],
  [".profile"],
  [".zshrc"],
  [".zshenv"],
  [".zprofile"],
  [".envrc"],
  // Git runs these, or what they point to, on the user's next commit or fetch.
  [".git", "hooks"],
  [".git", "config"],
  [".gitconfig"],
  [".ripgreprc"],
  [".gitmodules"],
  [".husky"],
  // Package manager settings, which can point installs at another registry or run scripts.
  [".npmrc"],
  [".yarnrc"],
  [".yarnrc.yml"],
  [".pnpmfile.cjs"],
  [".yarn", "releases"],
  [".yarn", "plugins"],
  // Tool version managers, which can fetch and run another binary.
  ["mise.toml"],
  [".mise.toml"],
  [".tool-versions"],
  // Editor settings and tasks that run when the folder is opened.
  [".vscode"],
  [".idea"],
  [".mcp.json"],
];

/**
 * What the ask policy protects on top of `writeFencedPaths`: all of
 * `.claude/`, which Claude Code reads settings and hooks from. All of `.git/`
 * is protected at any depth by `isProtectedPath`, not by an entry here.
 */
const askOnlyPaths: readonly PathSegments[] = [[".claude"]];

/** The entries an edit asks for in "no sandbox" mode: the write-fenced ones and the wider ones. */
export const askProtectedPaths: readonly PathSegments[] = [...writeFencedPaths, ...askOnlyPaths];

/**
 * Whether a path in the working folder is protected: `inside` is its segments
 * relative to the working folder's real path, with no `.` or `..`.
 *
 * It is protected when it is, or is in, a listed entry, and when a `.git`
 * segment is anywhere in it. The `.git` rule has no list to keep up to date:
 * a repository or submodule made during the session is covered too.
 *
 * Letter case is always ignored. A missing part keeps the case it was typed
 * in, so no real-path lookup can fix it, and on a file system that ignores
 * case (Windows, macOS by default) `.Claude` is `.claude`. Asking once too
 * often costs a click; missing a match plants a hook.
 */
export function isProtectedPath(inside: PathSegments): boolean {
  const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
  if (inside.some((segment) => same(segment, ".git"))) return true;
  return askProtectedPaths.some((entry) =>
    entry.every((segment, index) => index < inside.length && same(inside[index] ?? "", segment)),
  );
}
