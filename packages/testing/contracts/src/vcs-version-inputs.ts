/** Inputs the {@link Vcs} cases for port version 2 refuse or use. */

/**
 * Versions `readAt`, `listAt`, `addWorktree` and `diffBetween` must refuse
 * with a `RangeError`: only a full commit id is a version. A branch name or
 * any revision git expands would read something other than what was saved.
 */
export const invalidCommitRefs: readonly string[] = [
  "",
  "HEAD",
  "HEAD~1",
  "main",
  "@",
  "@{-1}",
  "-x",
  "--output=written.txt",
  "--upload-pac=touch pwned",
  // A short id, an id in capitals and an id with something after it.
  "0123456",
  "0123456789ABCDEF0123456789ABCDEF01234567",
  "0123456789abcdef0123456789abcdef01234567^",
  "0123456789abcdef0123456789abcdef01234567:a.yaml",
  " 0123456789abcdef0123456789abcdef01234567",
  "0123456789abcdef0123456789abcdef0123456",
  "0123456789abcdef0123456789abcdef012345678",
];

/** A well-formed commit id that no repository in the suite has. */
export const unknownCommit = "0123456789abcdef0123456789abcdef01234567";

/**
 * A patch changing a one-line file `path` from `before` to `after`, as `git
 * diff` writes it. With no context lines, `git apply` matches it only to a
 * file of exactly that one line.
 */
export function linePatch(path: string, before: string, after: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1 +1 @@",
    `-${before}`,
    `+${after}`,
    "",
  ].join("\n");
}

/**
 * Patches `applyPatch` must refuse with a `RangeError`, and change nothing:
 * each names a path the port refuses, as the file it changes or the file it
 * renames or copies to. `a.yaml` holds "1" and `.env` "KEY=1" when they run.
 */
export const unsafePatches: readonly [string, string][] = [
  ["changes .git/config", linePatch(".git/config", "[core]", "[core] fsmonitor = x")],
  ["changes .GIT/config", linePatch(".GIT/config", "[core]", "[core] fsmonitor = x")],
  ["changes .env", linePatch(".env", "KEY=1", "KEY=2")],
  ["changes .studio/trust.json", linePatch(".studio/trust.json", "{}", '{"a":1}')],
  ["changes a file outside the folder", linePatch("../x.yaml", "1", "2")],
  ["changes a file by absolute path", linePatch("/x.yaml", "1", "2")],
  [
    "creates a hook",
    [
      "diff --git a/.git/hooks/post-checkout b/.git/hooks/post-checkout",
      "new file mode 100755",
      "--- /dev/null",
      "+++ b/.git/hooks/post-checkout",
      "@@ -0,0 +1 @@",
      "+touch pwned",
      "",
    ].join("\n"),
  ],
  [
    "renames a file into .git",
    [
      "diff --git a/a.yaml b/.git/config",
      "similarity index 100%",
      "rename from a.yaml",
      "rename to .git/config",
      "",
    ].join("\n"),
  ],
  [
    "copies a file to .env",
    [
      "diff --git a/a.yaml b/.env",
      "similarity index 100%",
      "copy from a.yaml",
      "copy to .env",
      "",
    ].join("\n"),
  ],
  [
    "names one path in its header and another in its lines",
    [
      "diff --git a/a.yaml b/a.yaml",
      "--- a/a.yaml",
      "+++ b/.git/config",
      "@@ -1 +1 @@",
      "-1",
      "+2",
      "",
    ].join("\n"),
  ],
  // Safe on its own; refused because the other half of the patch is unsafe.
  [
    "changes a.yaml and .git/config",
    linePatch("a.yaml", "1", "2") + linePatch(".git/config", "[core]", "x"),
  ],
];
