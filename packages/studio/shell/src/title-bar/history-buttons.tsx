import { BackIcon, Button, ForwardIcon } from "@halonicjs/studio-kit";
import { useCallback, useId, useSyncExternalStore } from "react";
import { useHistoryMoves } from "../tabs/history-moves.ts";
import type { TabSet } from "../tabs/tab-set.ts";

/** Props for {@link HistoryButtons}. */
export interface HistoryButtonsProps {
  /** The open workspace's tabs: Back and Forward follow the active one. */
  readonly tabs: TabSet;
}

/**
 * Back and Forward of the active tab, for the title bar after the Halonic Studio mark (design
 * decision HAL-8416, UX checklist 1.1). They stay in the Tab order when there's nowhere to go, and
 * say so. The Assistant button joins them with the Assistant (T14); until then there's none.
 *
 * @example
 * <ShellFrame titleBar={<><TitleBarBrand /><HistoryButtons tabs={workspace.tabs} /></>} …>
 */
export function HistoryButtons({ tabs }: HistoryButtonsProps) {
  // One `subscribe` per tab set, so React doesn't subscribe again on every render.
  const subscribe = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs]);
  const state = useSyncExternalStore(subscribe, () => tabs.state);
  const moves = useHistoryMoves(tabs);
  return (
    <>
      <HistoryButton direction="back" available={state.canGoBack} onClick={moves.back} />
      <HistoryButton direction="forward" available={state.canGoForward} onClick={moves.forward} />
    </>
  );
}

/** What Back and Forward are called, and why they can't be used. */
const historyWords = {
  back: { label: "Back", icon: <BackIcon />, nowhere: "Nothing to go back to" },
  forward: { label: "Forward", icon: <ForwardIcon />, nowhere: "Nothing to go forward to" },
} as const;

interface HistoryButtonProps {
  readonly direction: "back" | "forward";
  readonly available: boolean;
  readonly onClick: () => void;
}

/**
 * Back or Forward, a 32px ghost icon button (VK T2-F48). With nowhere to go it is unavailable,
 * not disabled: it keeps its Tab stop, and its description says why. These two are the one
 * exception to a visible reason line (Sofia, HAL-3159): the reason is read only by screen readers
 * here, and also becomes the tooltip once tooltips come to the title bar. It stays in the DOM, so
 * it never appears only on hover.
 */
function HistoryButton({ direction, available, onClick }: HistoryButtonProps) {
  const reasonId = useId();
  const words = historyWords[direction];
  return (
    <>
      <Button
        variant="ghost"
        icon={words.icon}
        label={words.label}
        unavailable={available ? undefined : { reason: reasonId }}
        onClick={onClick}
      />
      <span id={reasonId} className="sr-only">
        {words.nowhere}
      </span>
    </>
  );
}
