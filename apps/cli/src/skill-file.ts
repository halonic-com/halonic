import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";

/**
 * The file of a skill as a hub's agent sees it: the hub's own, else the
 * workspace's shared one, as the run's definitions take them.
 *
 * @example
 * skillFileOf(workspace, "support", "review")?.path; // "hubs/support/skills/review/SKILL.md"
 */
export function skillFileOf(workspace: LoadedWorkspace, hubId: string, skillId: string) {
  const named = filesOf(workspace, "skill").filter((file) => file.value.id === skillId);
  return named.find((file) => file.hub === hubId) ?? named.find((file) => file.hub === null);
}
