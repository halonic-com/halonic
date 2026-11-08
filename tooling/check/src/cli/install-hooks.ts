import { execFileSync } from "node:child_process";

/**
 * Runs on `pnpm install` (the root `prepare` script): points git at the
 * repo's own hooks in `tooling/check/hooks`, so the leak guard runs on
 * every commit and push. No hook framework; git's `core.hooksPath` is
 * enough. Only this clone's config changes, never the global one.
 */

const hooksPath = "tooling/check/hooks";

function git(args: readonly string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
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
  let current = "";
  try {
    current = git(["config", "--local", "core.hooksPath"]);
  } catch {
    // Not set yet.
  }
  if (current === hooksPath) {
    return 0;
  }
  git(["config", "--local", "core.hooksPath", hooksPath]);
  const replaced = current === "" ? "" : ` (it was ${current})`;
  console.log(`leak guard: git hooks installed from ${hooksPath}${replaced}.`);
  return 0;
}

process.exitCode = main();
