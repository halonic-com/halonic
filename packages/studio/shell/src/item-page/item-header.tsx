import {
  Button,
  Menu,
  type MenuItem,
  MoreIcon,
  type Tab,
  type TabIds,
  TabList,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { NameField } from "./name-field.tsx";

/** Props for {@link ItemHeader}. */
export interface ItemHeaderProps<Id extends string> {
  /** The kind's 16px icon. */
  readonly icon: ReactNode;
  /** The kind as a word, "Workflow": shown in small caps, and it names the views and the name field. */
  readonly kind: string;
  readonly name: string;
  readonly onRename: (name: string) => void;
  /** The item's ⋮ menu. Without entries there's no ⋮. */
  readonly actions?: readonly MenuItem[] | undefined;
  /** The page's views, Flow · Configuration · Runs, with their badges. */
  readonly views: readonly Tab<Id>[];
  readonly view: Id;
  readonly onPickView: (view: Id) => void;
  /** The same ids as the `TabPanel` that shows the view. */
  readonly tabIds: TabIds;
  /** The item's own controls at the right: ▶ Run. */
  readonly end?: ReactNode;
}

/**
 * The item page's tab header (UX checklist 1.10, VK T7-F5 and F9): 52px across the tab, at the top
 * of the page while its view scrolls, with the
 * kind's icon, the kind in small caps and the name as a rename field, then its ⋮ at the left; the
 * views nav centred; the item's own controls at the right. The kind and the name are the page's
 * `h1`, where focus goes when the tab opens.
 */
export function ItemHeader<Id extends string>({
  icon,
  kind,
  name,
  onRename,
  actions = [],
  views,
  view,
  onPickView,
  tabIds,
  end,
}: ItemHeaderProps<Id>) {
  return (
    <header className={headerClasses}>
      <div className="flex min-w-0 items-center gap-1">
        <h1 className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-grid size-icon-sm shrink-0 text-fg-subtle *:size-full"
          >
            {icon}
          </span>
          <span className={kindClasses}>{kind}</span>
          <NameField name={name} label={`${kind} name`} onRename={onRename} />
        </h1>
        {actions.length === 0 ? null : (
          <Menu
            entries={actions}
            trigger={(trigger) => (
              <Button
                {...trigger}
                variant="ghost"
                size="sm"
                icon={<MoreIcon />}
                label={`More actions for ${name}`}
              />
            )}
          />
        )}
      </div>
      <TabList
        label={`${kind} views`}
        tabs={views}
        selected={view}
        onSelect={onPickView}
        ids={tabIds}
      />
      <div className="flex min-w-0 items-center justify-end gap-2">{end}</div>
    </header>
  );
}

// Three columns, so the views stay centred on the tab whatever the name's length.
const headerClasses = [
  "sticky top-0 z-(--layer-sticky) grid min-h-13 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4",
  "border-b border-border bg-surface px-4",
].join(" ");

// The kind label of the step cards and the run receipt (component specs 24.1).
const kindClasses = "shrink-0 text-caption uppercase tracking-label text-fg-subtle";
