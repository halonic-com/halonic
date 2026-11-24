import type { KeyboardEvent, MouseEvent } from "react";
import { isComposing } from "../keyboard/is-composing.ts";

export interface RowHandlerOptions<Id extends string> {
  readonly id: Id;
  readonly isUnavailable: boolean;
  readonly onOpen: ((id: Id) => void) | undefined;
  readonly onOpenInNewTab: ((id: Id) => void) | undefined;
  /** An Alt-click or Alt Enter (⌥ on a Mac), as an agent's row shows the agent in chat. */
  readonly onAltOpen: ((id: Id) => void) | undefined;
  /** Toggles the row, when the list allows selection. */
  readonly onToggle: ((id: Id) => void) | undefined;
}

/**
 * The row's click and key handlers. A plain Enter or click opens; with Ctrl or ⌘ held it opens in
 * a new tab, and does nothing without `onOpenInNewTab`; with only Alt (⌥) held it calls
 * `onAltOpen`, and does nothing without it; with Shift held, Alt or not, it does nothing.
 */
export function rowHandlers<Id extends string>({
  id,
  isUnavailable,
  onOpen,
  onOpenInNewTab,
  onAltOpen,
  onToggle,
}: RowHandlerOptions<Id>) {
  const open = (event: {
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
  }) => {
    if (event.ctrlKey || event.metaKey) {
      onOpenInNewTab?.(id);
      return;
    }
    // Shift wins over Alt, so a Shift+Alt click does nothing, as a Shift-click does.
    if (event.shiftKey) {
      return;
    }
    if (event.altKey) {
      onAltOpen?.(id);
    } else {
      onOpen?.(id);
    }
  };

  return {
    onClick: (event: MouseEvent<HTMLTableCellElement>) => {
      if (isUnavailable) {
        return;
      }
      if (onOpen !== undefined) {
        open(event);
      } else {
        onToggle?.(id);
      }
    },
    // A middle click opens a new tab, as on a link; with Shift or Alt held it does nothing.
    onAuxClick: (event: MouseEvent<HTMLTableCellElement>) => {
      if (event.button === 1 && !isUnavailable && onOpen !== undefined) {
        event.preventDefault();
        if (!(event.shiftKey || event.altKey)) {
          onOpenInNewTab?.(id);
        }
      }
    },
    onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
      if (event.target !== event.currentTarget || isComposing(event)) {
        return;
      }
      if (event.key === " ") {
        // Never scrolls the page, even when the row can't be selected.
        event.preventDefault();
        if (!isUnavailable) {
          onToggle?.(id);
        }
      } else if (event.key === "Enter" && onOpen !== undefined && !isUnavailable) {
        event.preventDefault();
        open(event);
      }
    },
  };
}
