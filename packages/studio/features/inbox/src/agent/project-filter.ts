import type { InboxItem as AgentItem, MessagingProject } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";

/** The project filter's value: every item, the items of no project, or one project's, by its ID. */
export type ProjectFilter = "all" | "none" | `project:${string}`;

/** One choice of the project filter. */
export interface ProjectChip {
  readonly value: ProjectFilter;
  readonly label: string;
  /** How many items that wait it holds. */
  readonly count: number;
  /** The project, for its dot; none for "All projects" and "No project". */
  readonly project?: MessagingProject;
}

/** The chip for items with no project; the Inbox's own items are always under it. */
export const noProject = "No project";

/**
 * The project filter's choices (`inbox.project-filter`): "All projects", each project of an item
 * that waits, most items first, then by name, then "No project" when an item waits with none. With
 * no project at all there is nothing to filter, so there are none.
 */
export function projectChips(
  waiting: readonly AgentItem[],
  ownWaiting: number,
): readonly ProjectChip[] {
  const projects = new Map<string, { project: MessagingProject; count: number }>();
  for (const item of waiting) {
    if (item.project === undefined) continue;
    const seen = projects.get(item.project.id);
    projects.set(item.project.id, { project: item.project, count: (seen?.count ?? 0) + 1 });
  }
  if (projects.size === 0) return [];
  const named = [...projects.values()]
    .sort((a, b) => b.count - a.count || a.project.name.localeCompare(b.project.name))
    .map(
      ({ project, count }): ProjectChip => ({
        value: `project:${project.id}`,
        label: markHiddenName(project.name),
        count,
        project,
      }),
    );
  const unfiled = ownWaiting + waiting.filter((item) => item.project === undefined).length;
  return [
    { value: "all", label: "All projects", count: waiting.length + ownWaiting },
    ...named,
    ...(unfiled > 0 ? [{ value: "none" as const, label: noProject, count: unfiled }] : []),
  ];
}

/** The filter as the chips can show it: one whose project no longer waits is all again. */
export function shownFilter(filter: ProjectFilter, chips: readonly ProjectChip[]): ProjectFilter {
  return chips.some((chip) => chip.value === filter) ? filter : "all";
}

/** Whether an agent's item shows under the filter. */
export function agentItemShows(item: AgentItem, filter: ProjectFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return item.project === undefined;
  return item.project !== undefined && filter === `project:${item.project.id}`;
}

/** Whether the Inbox's own items show under the filter: they belong to no project. */
export function ownItemsShow(filter: ProjectFilter): boolean {
  return filter === "all" || filter === "none";
}
