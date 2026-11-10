/** Patches the {@link Vcs} cases for port version 2 apply or refuse. */

import { unsafeVcsPaths } from "./vcs-harness.ts";
import { unknownCommit } from "./vcs-version-inputs.ts";

/**
 * A patch changing a one-line file `path` from `before` to `after`, as `git
 * diff` writes it. With no context lines, `git apply` matches it only to a
 * file of exactly that one line.
 */
export function linePatch(path: string, before: string, after: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- ${fileName("a", path)}`,
    `+++ ${fileName("b", path)}`,
    "@@ -1 +1 @@",
    `-${before}`,
    `+${after}`,
    "",
  ].join("\n");
}

/** A patch deleting the one-line file `path` that holds `line`, as `git diff` writes it. */
export function deletePatch(path: string, line: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    "deleted file mode 100644",
    `--- ${fileName("a", path)}`,
    "+++ /dev/null",
    "@@ -1 +0,0 @@",
    `-${line}`,
    "",
  ].join("\n");
}

/** A patch creating the one-line file `path` holding `line`, as `git diff` writes it. */
export function newFilePatch(path: string, line: string): string {
  return [
    `diff --git a/${path} b/${path}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ ${fileName("b", path)}`,
    "@@ -0,0 +1 @@",
    `+${line}`,
    "",
  ].join("\n");
}

/** A `---` or `+++` line's file name: git adds a tab after one with a space in it. */
function fileName(side: "a" | "b", path: string): string {
  return path.includes(" ") ? `${side}/${path}\t` : `${side}/${path}`;
}

/**
 * Patches `applyPatch` must refuse with a `RangeError`, and change nothing,
 * on safe paths too: anything but plain text edits, adds and deletes. Each
 * is as `git diff` writes it, and plain `git apply` takes all but the last
 * ("says a binary file differs") on a workspace where `a.yaml` holds "1".
 * A symbolic link is the dangerous one: once `link` points at `.git`, a
 * later patch to `link/config` writes the repository's config.
 */
export const unsupportedPatches: readonly [string, string][] = [
  [
    "changes a file's mode",
    ["diff --git a/a.yaml b/a.yaml", "old mode 100644", "new mode 100755", ""].join("\n"),
  ],
  [
    "changes a file's mode and its lines",
    [
      "diff --git a/a.yaml b/a.yaml",
      "old mode 100644",
      "new mode 100755",
      "--- a/a.yaml",
      "+++ b/a.yaml",
      "@@ -1 +1 @@",
      "-1",
      "+2",
      "",
    ].join("\n"),
  ],
  [
    "creates a symbolic link",
    [
      "diff --git a/link b/link",
      "new file mode 120000",
      "--- /dev/null",
      "+++ b/link",
      "@@ -0,0 +1 @@",
      "+.git",
      "\\ No newline at end of file",
      "",
    ].join("\n"),
  ],
  [
    "turns a file into a symbolic link",
    deletePatch("a.yaml", "1") +
      [
        "diff --git a/a.yaml b/a.yaml",
        "new file mode 120000",
        "--- /dev/null",
        "+++ b/a.yaml",
        "@@ -0,0 +1 @@",
        "+.git",
        "\\ No newline at end of file",
        "",
      ].join("\n"),
  ],
  [
    "adds a gitlink",
    [
      "diff --git a/sub b/sub",
      "new file mode 160000",
      "--- /dev/null",
      "+++ b/sub",
      "@@ -0,0 +1 @@",
      `+Subproject commit ${unknownCommit}`,
      "",
    ].join("\n"),
  ],
  [
    "adds a binary file",
    [
      "diff --git a/x.bin b/x.bin",
      "new file mode 100644",
      `index ${"0".repeat(40)}..20b5be91886d0b6f26dc98a225c0dac05fe2c86e`,
      "GIT binary patch",
      "literal 3",
      "KcmYdfNCE%>hycU@",
      "",
      "literal 0",
      "HcmV?d00001",
      "",
      "",
    ].join("\n"),
  ],
  [
    "renames a file",
    [
      "diff --git a/a.yaml b/c.yaml",
      "similarity index 100%",
      "rename from a.yaml",
      "rename to c.yaml",
      "",
    ].join("\n"),
  ],
  [
    "renames a file and changes its lines",
    [
      "diff --git a/a.yaml b/c.yaml",
      "similarity index 50%",
      "rename from a.yaml",
      "rename to c.yaml",
      "--- a/a.yaml",
      "+++ b/c.yaml",
      "@@ -1 +1 @@",
      "-1",
      "+2",
      "",
    ].join("\n"),
  ],
  [
    "copies a file",
    [
      "diff --git a/a.yaml b/c.yaml",
      "similarity index 100%",
      "copy from a.yaml",
      "copy to c.yaml",
      "",
    ].join("\n"),
  ],
  // git refuses this one too, with no full index line; the port still refuses it as binary.
  [
    "says a binary file differs",
    [
      "diff --git a/x.bin b/x.bin",
      "new file mode 100644",
      "index 0000000..20b5be9",
      "Binary files /dev/null and b/x.bin differ",
      "",
    ].join("\n"),
  ],
];

/**
 * Patches `applyPatch` must refuse with a `RangeError`, and change nothing:
 * each names a path the port refuses, as the file it changes or the file it
 * renames or copies to. `a.yaml` holds "1", and `.env`, `.env.local` and `.envrc` the
 * lines below, when they run.
 */
export const unsafePatches: readonly [string, string][] = [
  ["changes .git/config", linePatch(".git/config", "[core]", "[core] fsmonitor = x")],
  ["changes .GIT/config", linePatch(".GIT/config", "[core]", "[core] fsmonitor = x")],
  ["changes .env", linePatch(".env", "KEY=1", "KEY=2")],
  ["changes .env.local", linePatch(".env.local", "KEY=2", "KEY=3")],
  ["changes .envrc", linePatch(".envrc", "export KEY=3", "export KEY=4")],
  ["deletes .env", deletePatch(".env", "KEY=1")],
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
    "copies a file to .env.example, which isn't there yet",
    [
      "diff --git a/a.yaml b/.env.example",
      "similarity index 100%",
      "copy from a.yaml",
      "copy to .env.example",
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
  // git writes a path with unusual bytes C-quoted, and `git apply` decodes it:
  // `.\145nv` is `.env`, which git doesn't protect by itself.
  [
    "changes .env, its name C-quoted",
    [
      'diff --git "a/.\\145nv" "b/.\\145nv"',
      '--- "a/.\\145nv"',
      '+++ "b/.\\145nv"',
      "@@ -1 +1 @@",
      "-KEY=1",
      "+KEY=2",
      "",
    ].join("\n"),
  ],
  [
    "changes .git/config, its name C-quoted",
    [
      'diff --git "a/.\\147it/config" "b/.\\147it/config"',
      '--- "a/.\\147it/config"',
      '+++ "b/.\\147it/config"',
      "@@ -1 +1 @@",
      "-[core]",
      "+[core] fsmonitor = x",
      "",
    ].join("\n"),
  ],
];

/**
 * A change and a new file at each path every `Vcs` method refuses, so
 * `applyPatch` checks a patch's paths as strictly as any other path.
 */
export const unsafePathPatches: readonly [string, string][] = unsafeVcsPaths.flatMap(
  (path): [string, string][] => [
    [`changes ${JSON.stringify(path)}`, linePatch(path, "1", "2")],
    [`creates ${JSON.stringify(path)}`, newFilePatch(path, "1")],
  ],
);
