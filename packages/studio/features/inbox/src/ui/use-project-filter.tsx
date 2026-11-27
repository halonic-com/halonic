import type { InboxItem as AgentItem } from "@halonicjs/ports";
import { type ReactNode, useState } from "react";
import {
  ownItemsShow,
  type ProjectFilter,
  projectChips,
  shownFilter,
} from "../agent/project-filter.ts";
import { ProjectLine } from "./project-line.tsx";

/** The Inbox's project filter, as the page uses it. */
export interface ProjectFilterRow {
  /** The one line of chips over Needs you, or nothing while no item that waits has a project. */
  readonly chips: ReactNode;
  /** The filter as shown, for the agents' rows. */
  readonly filter: ProjectFilter;
  /** The Inbox's own items the filter shows: all of them, or none while a project is picked. */
  readonly own: <Item>(items: readonly Item[]) => readonly Item[];
}

/**
 * The project filter over Needs you (`inbox.project-filter`, `inbox.project-line`): "All
 * projects", each project of an agent's item that waits, and "No project", under which the Inbox's
 * own items are (`ownWaiting` of them wait).
 */
export function useProjectFilter(
  waiting: readonly AgentItem[],
  ownWaiting: number,
): ProjectFilterRow {
  const [picked, setPicked] = useState<ProjectFilter>("all");
  const options = projectChips(waiting, ownWaiting);
  const filter = shownFilter(picked, options);
  return {
    chips:
      options.length === 0 ? null : (
        <ProjectLine options={options} value={filter} onChange={setPicked} />
      ),
    filter,
    own: (items) => (ownItemsShow(filter) ? items : []),
  };
}
