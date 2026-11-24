import type { InboxItem as AgentItem, MessagingProject } from "@halonicjs/ports";
import { markHiddenName } from "@halonicjs/std";

/** The project filter's value: every item, the items of no project, or one project's, by its ID. */
export type ProjectFilter = "all" | "none" | `project:${string}`;

/** One chip of the project filter. */
export interface ProjectChip {
  readonly value: ProjectFilter;
  readonly label: string;
}

/** The chip for items with no project; the Inbox's own items are always under it. */
export const noProject = "No project";

/**
 * The project filter's chips (`inbox.project-filter`): "All projects", each project of an item
 * that waits, by name, then "No project" when an item waits with none. With no project at all
 * there is nothing to filter, so there are no chips.
 */
export function projectChips(
  waiting: readonly AgentItem[],
  ownWaiting: boolean,
): readonly ProjectChip[] {
  const projects = new Map<string, MessagingProject>();
  for (const item of waiting) {
    if (item.project !== undefined) projects.set(item.project.id, item.project);
  }
  if (projects.size === 0) return [];
  const named = [...projects.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (project): ProjectChip => ({
        value: `project:${project.id}`,
        label: markHiddenName(project.name),
      }),
    );
  const unfiled = ownWaiting || waiting.some((item) => item.project === undefined);
  return [
    { value: "all", label: "All projects" },
    ...named,
    ...(unfiled ? [{ value: "none" as const, label: noProject }] : []),
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
