import {
  BackIcon,
  Button,
  ChevronDownIcon,
  ContentHeader,
  Menu,
  MoreIcon,
  Tooltip,
} from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { type InboxItem, isRunItem } from "../inbox-items.ts";
import { inboxRow, runItemContext, waitingLine } from "./inbox-row.tsx";
import { itemMark } from "./row-marks.tsx";
import type { RunFactsOf } from "./run-facts.ts";
import type { ItemSteps } from "./use-item-steps.ts";

/** What the header over an open item says: its 40px picture or mark, its title and its line. */
export interface ItemHeading {
  readonly picture: ReactNode;
  readonly title: string;
  readonly line: ReactNode | undefined;
}

/**
 * The open item's heading (`inbox.header-avatar`): one of the Inbox's own items' row title and
 * line, as the list shows them with the wait at the line's end, under its mark at 40px, else the agent's open cards' heading.
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
  if (!isRunItem(item)) return { picture, title: row.title, line: row.meta };
  const facts = runFacts?.(item.runId);
  if (waits) return { picture, title: row.title, line: waitingLine(item, now, facts) };
  const context = runItemContext(item, facts);
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
  /** The ··· menu's **Mark as unread**, for an item that waits (`inbox.read-marks`). */
  readonly markUnread?: (() => void) | undefined;
  /** Up and down to the item before or after it among what waits; without them, no buttons. */
  readonly steps?: ItemSteps | undefined;
}

/**
 * The header over the open item, the Messenger's chat header (HAL-19192, `inbox.header-avatar`):
 * its 40px picture, its title over its row's line and, at the end, where it is among what waits
 * ("2 of 6", design review HAL-18481, 7) with up and down to the items beside it (K and J). With one
 * pane at a time the item is pushed like a page (HAL-11945 Q12), so the back arrow named **Back to
 * Inbox** comes first (sketch E on HAL-19192): an arrow, not the words, leaves a phone's title room
 * (Sofia, HAL-19913). There the up and down buttons are left out, as Back covers them, so the title
 * keeps its room (Sofia, HAL-20395); K and J still step. The card under it
 * fills the rest of the pane, so its body scrolls with its answers in sight; in a short window the
 * whole pane scrolls, header included, as a Dialog's does.
 */
export function ItemHeader({ heading, back, place, close, markUnread, steps }: ItemHeaderProps) {
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
      actions={
        place === null ? null : (
          <>
            <p className="shrink-0 text-small text-fg-muted">{place}</p>
            {steps === undefined || back ? null : <StepButtons steps={steps} />}
            {markUnread === undefined ? null : (
              <ItemMenu title={heading.title} markUnread={markUnread} />
            )}
          </>
        )
      }
    />
  );
}

/**
 * The ··· menu at the end of the header, as the Messenger's chat has it (Sofia's sketch H on
 * HAL-19192), with **Mark as unread**: the page marks the item, closes it and puts focus on its row.
 */
function ItemMenu({
  title,
  markUnread,
}: {
  readonly title: string;
  readonly markUnread: () => void;
}) {
  return (
    <Menu
      align="end"
      trigger={(trigger) => (
        <Button
          {...trigger}
          variant="ghost"
          size="sm"
          icon={<MoreIcon />}
          label={`More actions for ${title}`}
        />
      )}
      entries={[{ id: "mark-unread", label: "Mark as unread", onSelect: markUnread }]}
    />
  );
}

/**
 * Up and down to the item before or after the open one among what waits, named "Previous item" and
 * "Next item" with their keys, K and J, in the tooltip (note 2 of the HAL-19192 sketches). Past
 * either end its button keeps its place but is hidden, from screen readers and the Tab order too,
 * since the kit's buttons have no `disabled` (component specs 23, A1).
 */
function StepButtons({ steps }: { readonly steps: ItemSteps }) {
  return (
    <span className="flex shrink-0">
      <StepButton name="Previous item" keyName="K" onStep={steps.up} up />
      <StepButton name="Next item" keyName="J" onStep={steps.down} />
    </span>
  );
}

function StepButton({
  name,
  keyName,
  onStep,
  up = false,
}: {
  readonly name: string;
  readonly keyName: string;
  readonly onStep: (() => void) | undefined;
  readonly up?: boolean;
}) {
  return (
    <span className={onStep === undefined ? "invisible flex" : "flex"}>
      <Tooltip text={name} keys={[keyName]} isName>
        {(linked) => (
          <Button
            {...linked}
            variant="ghost"
            size="sm"
            icon={
              <span className={`flex size-full ${up ? "rotate-180" : ""}`}>
                <ChevronDownIcon />
              </span>
            }
            label={name}
            aria-keyshortcuts={keyName}
            onClick={onStep}
          />
        )}
      </Tooltip>
    </span>
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
