import { BackIcon, Button, ContentHeader, Tooltip } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { type InboxItem, isRunItem } from "../inbox-items.ts";
import { inboxRow, runItemContext } from "./inbox-row.tsx";
import { itemMark } from "./row-marks.tsx";
import type { RunFactsOf } from "./run-facts.ts";

/** What the header over an open item says: its 40px picture or mark, its title and its line. */
export interface ItemHeading {
  readonly picture: ReactNode;
  readonly title: string;
  readonly line: ReactNode | undefined;
}

/**
 * The open item's heading (`inbox.header-avatar`): one of the Inbox's own items' row title and
 * line, as the list shows them, under its mark at 40px, else the agent's open cards' heading.
 * Once a run's item no longer `waits` (decided, or stale since the run moved on) its line keeps
 * the run and drops the wait, as its card no longer says since when it waits.
 */
export function openHeading(
  item: InboxItem | null,
  waits: boolean,
  agentHeading: (now: Date) => ItemHeading | undefined,
  now: Date,
  runFacts: RunFactsOf | undefined,
): ItemHeading | undefined {
  if (item === null) return agentHeading(now);
  const row = inboxRow(item, now, runFacts);
  const picture = itemMark(item, "header").avatar;
  if (waits || !isRunItem(item)) return { picture, title: row.title, line: row.meta };
  const context = runItemContext(item, runFacts?.(item.runId));
  return { picture, title: row.title, line: context === "" ? undefined : context };
}

/** The props of {@link ItemHeader}. */
interface ItemHeaderProps {
  readonly heading: ItemHeading;
  /** One pane at a time (a phone or a narrow window): **Back to Inbox** leads the header. */
  readonly back: boolean;
  /** Where the item is among what waits, "2 of 6"; `null` for one that doesn't wait. */
  readonly place: string | null;
  readonly close: () => void;
}

/**
 * The header over the open item, the Messenger's chat header (HAL-19192, `inbox.header-avatar`):
 * its 40px picture, its title over its row's line and, at the end, where it is among what waits
 * ("2 of 6", design review HAL-18481, 7). With one pane at a time the item is pushed like a page
 * (HAL-11945 Q12), so the back arrow named **Back to Inbox** comes first (sketch E on HAL-19192):
 * an arrow, not the words, leaves a phone's title room (Sofia, HAL-19913). The card under it
 * fills the rest of the pane, so its body scrolls with its answers in sight; in a short window the
 * whole pane scrolls, header included, as a Dialog's does.
 */
export function ItemHeader({ heading, back, place, close }: ItemHeaderProps) {
  return (
    <ContentHeader
      picture={
        <>
          {back ? <BackButton close={close} /> : null}
          {heading.picture}
        </>
      }
      title={heading.title}
      line={heading.line}
      actions={place === null ? null : <p className="shrink-0 text-small text-fg-muted">{place}</p>}
    />
  );
}

const backName = "Back to Inbox";

/** The back arrow, an icon button at touch size whose name and tooltip say **Back to Inbox**. */
function BackButton({ close }: { readonly close: () => void }) {
  return (
    <Tooltip text={backName} isName>
      {(linked) => (
        <Button
          {...linked}
          variant="ghost"
          size="touch"
          icon={<BackIcon />}
          label={backName}
          onClick={close}
        />
      )}
    </Tooltip>
  );
}
