import { type MenuItem, type Tab, TabPanel, useTabIds } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { ItemHeader } from "./item-header.tsx";
import { useRememberedView } from "./remembered-view.ts";

/** Props for {@link ItemPage}. */
export interface ItemPageProps<Id extends string> {
  /** The kind's 16px icon. */
  readonly icon: ReactNode;
  /** The kind as a word: "Workflow". */
  readonly kind: string;
  readonly name: string;
  readonly onRename: (name: string) => void;
  readonly actions?: readonly MenuItem[] | undefined;
  /** The page's views, the first one shown when the tab first opens the item. */
  readonly views: readonly [Tab<Id>, ...Tab<Id>[]];
  /** The item's own controls in the header's right end: ▶ Run. */
  readonly end?: ReactNode;
  /** Draws the view that's picked. */
  readonly children: (view: Id) => ReactNode;
}

/**
 * The frame of an agent's, a workflow's or another item's page (UX checklist 1.10), for the
 * features to draw their item pages in: the tab header, and one view at a time under it, picked
 * in the header's views nav and remembered for the tab (req-shell `panels.one-view-at-a-time`).
 * The view takes the full width: the chat beside it comes once a feature provides one for the kind.
 *
 * @example
 * <ItemPage
 *   icon={<WorkflowIcon />}
 *   kind="Workflow"
 *   name={workflow.name}
 *   onRename={rename}
 *   views={[{ id: "flow", label: "Flow" }, { id: "configuration", label: "Configuration" }]}
 *   end={<RunButton />}
 * >
 *   {(view) => (view === "flow" ? <Flow /> : <Configuration />)}
 * </ItemPage>
 */
export function ItemPage<Id extends string>({ views, children, ...header }: ItemPageProps<Id>) {
  const tabIds = useTabIds();
  const [view, pick] = useRememberedView(
    views.map((candidate) => candidate.id),
    views[0].id,
  );
  return (
    // The tab's page is the scroller (TabPages), so the header stays at its top while the view
    // scrolls under it.
    <div className="flex min-h-full flex-col">
      <ItemHeader {...header} views={views} view={view} onPickView={pick} tabIds={tabIds} />
      <TabPanel ids={tabIds} tabs={views} selected={view}>
        {children(view)}
      </TabPanel>
    </div>
  );
}
