import { EmptyState } from "@halonicjs/studio-kit";
import { useLayoutEffect, useRef } from "react";
import { itemGoneWords } from "../errors/error-message.ts";

/** Props for {@link ItemGone}. */
export interface ItemGoneProps {
  /** The kind, as a word in a sentence: "agent", "workflow", "run". */
  readonly kindName: string;
  /** The place that lists that kind, as the sidebar names it: "Agents", "Workflows", "Runs". */
  readonly place: string;
  /** Opens the place. */
  readonly onGoTo: () => void;
}

/**
 * A tab or a link whose item isn't in this workspace any more (microcopy 2 "Item gone", state
 * coverage SH15): the Empty state "This agent isn't in this workspace any more." with
 * **Go to Agents**. Focus goes to its title when it shows, so a screen reader hears why the page
 * is empty.
 *
 * An item moved to the trash while its tab is open isn't gone: its page shows the feature's
 * "moved to the trash · Undo" strip instead (microcopy 2, revision 78).
 *
 * @example
 * <ItemGone kindName="agent" place="Agents" onGoTo={() => openPlace("agents")} />
 */
export function ItemGone({ kindName, place, onGoTo }: ItemGoneProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const words = itemGoneWords({ kindName, place });
  useLayoutEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <EmptyState
      titleRef={titleRef}
      title={words.sentence}
      action={{ label: words.goTo, onClick: onGoTo }}
    />
  );
}
