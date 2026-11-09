import type { KeyboardEvent, MouseEvent } from "react";
import { isComposing } from "../keyboard/is-composing.ts";

export interface RowHandlerOptions<Id extends string> {
  readonly id: Id;
  readonly isUnavailable: boolean;
  readonly onOpen: ((id: Id) => void) | undefined;
  readonly onOpenInNewTab: ((id: Id) => void) | undefined;
  /** Toggles the row, when the list allows selection. */
  readonly onToggle: ((id: Id) => void) | undefined;
}

/**
 * The row's click and key handlers. A plain Enter or click opens; with Ctrl or ⌘ held it opens in
 * a new tab, and does nothing without `onOpenInNewTab`; with Shift or Alt it does nothing.
 */
export function rowHandlers<Id extends string>({
  id,
  isUnavailable,
  onOpen,
  onOpenInNewTab,
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
    } else if (!(event.shiftKey || event.altKey)) {
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
    // A middle click opens a new tab, as on a link.
    onAuxClick: (event: MouseEvent<HTMLTableCellElement>) => {
      if (event.button === 1 && !isUnavailable && onOpen !== undefined) {
        event.preventDefault();
        onOpenInNewTab?.(id);
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
