import { type RefObject, useEffect, useRef, useState } from "react";
import type { ChangesList } from "../changes-list.ts";
import type { PhoneOpening } from "./phone-pages.ts";
import type { OpenItem } from "./use-open-item.ts";

/** What the desktop's content pane shows besides Get updates' choices: one item or one version. */
export interface PaneSelection {
  /** The version picked in History, shown in the pane; `undefined` when none is. */
  readonly versionId: string | undefined;
  /**
   * Counts the presses that opened something in the pane, the same item or version again included,
   * so the pane moves focus to its heading on each press and never on a read.
   */
  readonly presses: number;
  /** Opens a changed item in the pane, in place of a version or the choices. */
  readonly openRow: (id: string) => void;
  /** Opens a version in the pane, in place of an item or the choices. */
  readonly pickVersion: (id: string) => void;
  /** Puts focus back on a version's row in History, from the pane's Escape. */
  readonly focusVersionRow: (id: string) => void;
}

/**
 * One thing in the desktop's content pane at a time (`source-control.list-column`): an item's What
 * changed, a version's details, or Get updates' choices. Opening an item or a version while the
 * choices show puts them aside with the merge still started, as a phone's Back does, so the list's
 * Continue brings them back; when the choices open, what the pane held closes, so finishing them
 * doesn't bring it back with focus on it.
 */
export function usePaneSelection(
  list: ChangesList,
  nav: OpenItem,
  listColumn: RefObject<HTMLElement | null>,
  /** Whether the pane is drawn: on a phone the choices and What changed are pages of their own. */
  besidePane: boolean,
): PaneSelection {
  const [versionId, setVersionId] = useState<string>();
  const [presses, setPresses] = useState(0);
  const pressed = () => setPresses((count) => count + 1);
  const close = useRef(nav.close);
  close.current = nav.close;
  const choosing = list.state.choosing;
  useEffect(() => {
    if (!choosing || !besidePane) return;
    close.current();
    setVersionId(undefined);
  }, [choosing, besidePane]);
  const leaveChoices = () => {
    if (list.state.choosing) list.merge.leave();
  };
  return {
    versionId,
    presses,
    openRow: (id) => {
      leaveChoices();
      setVersionId(undefined);
      nav.show(id);
      pressed();
    },
    pickVersion: (id) => {
      leaveChoices();
      nav.close();
      setVersionId(id);
      pressed();
    },
    focusVersionRow: (id) => {
      listColumn.current
        ?.querySelector<HTMLElement>(
          `[data-part="history-list"] [data-row-id="${CSS.escape(id)}"] [role="gridcell"]`,
        )
        ?.focus();
    },
  };
}

/** How History opens a version: as a phone's page, in the desktop's pane, or in History itself. */
export function historyOpening(
  opening: PhoneOpening | undefined,
  selection: PaneSelection | undefined,
): {
  readonly onOpenVersion?: (id: string) => void;
  readonly returnTo?: string | undefined;
  readonly currentId?: string | undefined;
} {
  if (opening !== undefined) {
    return { onOpenVersion: opening.openVersion, returnTo: opening.versionFocus };
  }
  if (selection !== undefined) {
    return { onOpenVersion: selection.pickVersion, currentId: selection.versionId };
  }
  return {};
}
