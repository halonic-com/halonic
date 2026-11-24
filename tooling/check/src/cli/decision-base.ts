// A release branch name: `release/` and one or more path segments of letters,
// digits, `.`, `_` or `-`, so the name is safe to hand to `git fetch`.
const releaseBranch = /^release\/[\w.-]+(\/[\w.-]+)*$/;

/**
 * Whether `pnpm decision sign` signs a note for a pull request into this base
 * branch: `main` or a release branch, the bases the note check runs on
 * (`guard-notes.yml`). A fix into a frozen release branch needs a signed note
 * like any other (HAL-17599).
 */
export function isSignableBase(baseRefName: string): boolean {
  if (baseRefName === "main") {
    return true;
  }
  return releaseBranch.test(baseRefName) && !baseRefName.includes("..");
}
