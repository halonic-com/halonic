import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Runs on `pnpm install` (the root `prepare` script): copies the repo's own
 * hooks from `tooling/check/hooks` into `halonic-hooks` under the git dir and
 * points git's `core.hooksPath` there, so the leak guard runs on every commit
 * and push. No hook framework; git's `core.hooksPath` is enough. Only this
 * clone's config changes, never the global one.
 *
 * The hooks live outside the work tree so that checking out a branch never
 * changes which hooks git runs: only the next `pnpm install` does. The folder
 * sits under the common git dir, so every worktree of a clone shares it, and
 * it is copied afresh on every install, so a hook change on `main` lands with
 * the next install.
 *
 * A hooks path someone already set (husky, their own folder) is never
 * replaced, because that would silently switch off their hooks and anything
 * in `.git/hooks`. A path into a work tree's `tooling/check/hooks` is ours
 * from before the hooks moved, so it is replaced.
 */

/** Where the hooks are kept in the repo. */
const sourcePath = "tooling/check/hooks";

/** The files copied from `sourcePath`: the hooks git runs and the script they share. */
const hookFiles = ["pre-commit", "pre-push", "run-leak-guard.sh"] as const;

const sourceDir = resolve(import.meta.dirname, "../../hooks");

function git(args: readonly string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function localHooksPath(): string {
  try {
    return git(["config", "--local", "core.hooksPath"]);
  } catch {
    return ""; // Not set yet.
  }
}

/** Whether `path` is the in-tree hooks folder an older install pointed git at. */
function isOldInTreePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized === sourcePath || normalized.endsWith(`/${sourcePath}`);
}

function copyHooks(targetDir: string): void {
  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(targetDir, { recursive: true });
  for (const file of hookFiles) {
    const target = join(targetDir, file);
    copyFileSync(join(sourceDir, file), target);
    chmodSync(target, 0o755);
  }
}

function main(): number {
  if (process.env["CI"]) {
    return 0; // CI runs the same rules as a job; hooks would only slow its own commits down.
  }
  try {
    git(["rev-parse", "--is-inside-work-tree"]);
  } catch {
    return 0; // Not a git clone, for example an unpacked archive: nothing to install.
  }
  const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const targetDir = join(commonDir, "halonic-hooks");
  const current = localHooksPath();
  if (current !== "" && current !== targetDir && !isOldInTreePath(current)) {
    console.warn(
      `leak guard: git hooks NOT installed, because core.hooksPath is already set to ${current}. ` +
        `To use the leak guard, run "git config --local --unset core.hooksPath" and pnpm install again ` +
        `(this switches off the hooks in ${current}), or call ${sourcePath}/pre-commit from them.`,
    );
    return 0;
  }
  copyHooks(targetDir);
  if (current === targetDir) {
    return 0;
  }
  git(["config", "--local", "core.hooksPath", targetDir]);
  console.log(`leak guard: git hooks installed in ${targetDir}.`);
  return 0;
}

process.exitCode = main();
