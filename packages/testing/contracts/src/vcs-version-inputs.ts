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
  // JS `$` doesn't match before a final newline, but a check with the `m` flag would.
  "0123456789abcdef0123456789abcdef01234567\n",
];

/** Private entries a workspace folder can hold, which no version or worktree may give back. */
export const privateWorkspaceFiles: Readonly<Record<string, string>> = {
  ".env": "KEY=1\n",
  ".env.local": "KEY=2\n",
  ".envrc": "export KEY=3\n",
  ".studio/trust.json": "{}\n",
};

/** A well-formed commit id that no repository in the suite has. */
export const unknownCommit = "0123456789abcdef0123456789abcdef01234567";
