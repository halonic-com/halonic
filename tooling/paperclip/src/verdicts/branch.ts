/**
 * What a team branch `<agent>/HAL-<n>-…` names, as the recorded verdicts read
 * it: the agent and the task. It lives here, with the rest of the verdicts,
 * so a change to it is never a routine review (Julian's review of #6636,
 * HAL-19992); the PR watcher keeps its own reading (`branchOwner`).
 */

/** The task a branch `<agent>/HAL-<n>-…` names, or undefined for any other branch. */
export function copyTaskOf(branch: string): string | undefined {
  const match = /^[a-z0-9][\w.-]*\/(HAL-\d+)(?:-|$)/i.exec(branch);
  return match?.[1]?.toUpperCase();
}

/** The agent a branch names: its first part, before the first `/`, in lower case; undefined without one. */
export function branchAgentOf(branch: string): string | undefined {
  const slash = branch.indexOf("/");
  return slash > 0 ? branch.slice(0, slash).toLowerCase() : undefined;
}
