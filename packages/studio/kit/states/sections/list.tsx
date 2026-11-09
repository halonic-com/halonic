import { List, type ListRow } from "../../src/list/list.tsx";
import { ListHeading } from "../../src/list-heading/list-heading.tsx";
import { SkeletonBar } from "../../src/skeleton-bar/skeleton-bar.tsx";
import type { PartSection } from "../state-table.tsx";

/** A row's avatar: the agent's initials on a square. Screens bring their own. */
function Initials({ children }: { readonly children: string }) {
  return (
    <span className="grid size-7 place-items-center rounded-sm bg-accent-soft text-caption font-medium text-accent-text">
      {children}
    </span>
  );
}

const ignore = () => undefined;

const customerSupport: ListRow = {
  id: "customer-support",
  title: "Customer support",
  meta: "Answers mail · fast",
  avatar: <Initials>CS</Initials>,
  more: { label: "More actions for Customer support", onClick: ignore },
};

const mailTriage: ListRow = {
  id: "mail-triage",
  title: "Mail triage",
  meta: "Sorts the inbox · fast",
  avatar: <Initials>MT</Initials>,
  more: { label: "More actions for Mail triage", onClick: ignore },
};

const invoices: ListRow = {
  id: "invoices",
  title: "Invoices",
  avatar: <Initials>IN</Initials>,
  error: { reason: "File has an error", chip: "Error" },
  more: { label: "More actions for Invoices", onClick: ignore },
};

interface AgentsProps {
  readonly first?: ListRow;
  readonly heading?: boolean;
  readonly selected?: boolean;
}

/** The sheet's List: two agents, with the row's state on the first one. */
function Agents({ first = customerSupport, heading = false, selected = false }: AgentsProps) {
  return (
    <div className="w-80 phone:w-full">
      <List
        rows={[first, mailTriage]}
        {...(heading ? { heading: { name: "Agents", detail: "2" } } : { label: "Agents" })}
        {...(selected ? { selection: { selected: new Set([first.id]), onToggle: ignore } } : {})}
        onOpen={ignore}
      />
    </div>
  );
}

/** Two rows still loading, built from SkeletonBars the way a screen builds them. */
function LoadingAgents() {
  return (
    <div className="w-80 phone:w-full">
      <ListHeading name="Agents" />
      <div className="overflow-hidden rounded-md border border-border phone:rounded-none phone:border-x-0">
        {(["3/5", "1/2"] as const).map((width, index) => (
          <div
            key={width}
            className={`flex min-h-14 items-center gap-3 px-4 ${index === 0 ? "" : "border-t border-border"}`}
          >
            <SkeletonBar kind="avatar" />
            <div className="flex flex-1 flex-col gap-2">
              <SkeletonBar kind="title" width={width} />
              <SkeletonBar kind="meta" width="2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** No agents yet: the heading stays and the Empty state takes the box's place. */
function NoAgents() {
  return (
    <div className="w-80 phone:w-full">
      <List
        heading={{ name: "Agents" }}
        rows={[]}
        empty={{
          title: "No agents yet",
          description: "Agents do the work in your workflows.",
          action: { label: "New agent", onClick: ignore },
        }}
      />
    </div>
  );
}

/** Hover goes on the first row; focus on its first cell, where the keyboard puts it. */
const firstRow = "tr:first-child";
const firstCell = "tr:first-child > td:first-child";

export const listSection: PartSection = {
  id: "list",
  number: "6, 18.3, 19.3",
  name: "List, ListHeading, SkeletonBar",
  order: "kit 6, 18.3, 19.3 · a List with two rows; the state is on the first row",
  notApplicable: "read-only, busy",
  rows: [
    { name: "Default", copies: () => <Agents heading /> },
    { name: "Selected", copies: () => <Agents selected /> },
    { name: "Loading", copies: () => <LoadingAgents /> },
    { name: "Empty", copies: () => <NoAgents /> },
    { name: "Hover", force: "hover", target: firstRow, copies: () => <Agents /> },
    { name: "Focus", force: "focus", target: firstCell, copies: () => <Agents /> },
    {
      name: "Disabled",
      copies: () => (
        <Agents
          first={{
            ...customerSupport,
            unavailable: { reason: "Waiting for the model to download" },
          }}
        />
      ),
    },
    { name: "Error", copies: () => <Agents first={invoices} /> },
  ],
};
