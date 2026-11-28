import { useState } from "react";

/**
 * Where the Changes page keeps what's open: the tab's open item the shell keeps (`PlaceSlotProps`),
 * which the window's list column and the page share, or the page's own while it's drawn without a
 * window. One thing is open at a time: a changed item or a version.
 */
export interface PaneSlot {
  readonly open: string | undefined;
  readonly setOpen: (open: string | undefined) => void;
}

/** What's open in the content pane, read from its slot. */
export interface PaneState {
  /** The changed item whose What changed is open, or `undefined`. */
  readonly itemId: string | undefined;
  /** The version picked in History, or `undefined`. */
  readonly versionId: string | undefined;
  /**
   * Counts the presses that opened something, the same item or version again included, so the pane
   * moves focus to its heading on each press and never on a read.
   */
  readonly presses: number;
  /** Opens a changed item, or closes what's open with `undefined`; `pressed` counts a press. */
  readonly showItem: (id: string | undefined, pressed?: boolean) => void;
  /** Opens a version, counting a press. */
  readonly showVersion: (id: string) => void;
}

/**
 * What's open in the Changes pane, in `slot` when the window keeps it, so the list column and the
 * page agree and what's open stays when the window crosses 900px (`shell.rail-frame`).
 */
export function usePaneState(slot: PaneSlot | undefined): PaneState {
  const [own, setOwn] = useState<string>();
  const open = slot === undefined ? own : slot.open;
  const setOpen = slot === undefined ? setOwn : slot.setOpen;
  const shown = readOpen(open);
  const show = (kind: OpenKind, id: string | undefined, pressed: boolean) => {
    if (id === undefined) return setOpen(undefined);
    setOpen(writeOpen({ kind, id, presses: pressed ? shown.presses + 1 : shown.presses }));
  };
  return {
    itemId: shown.kind === "item" ? shown.id : undefined,
    versionId: shown.kind === "version" ? shown.id : undefined,
    presses: shown.presses,
    showItem: (id, pressed = false) => show("item", id, pressed),
    showVersion: (id) => show("version", id, true),
  };
}

type OpenKind = "item" | "version";

interface Open {
  readonly kind: OpenKind | undefined;
  readonly id: string | undefined;
  readonly presses: number;
}

// The slot holds one string: the kind, the press count and the id, which may itself hold a space.
function writeOpen({ kind, id, presses }: Open): string {
  return `${kind} ${presses} ${id}`;
}

function readOpen(open: string | undefined): Open {
  const [kind, presses, ...id] = open?.split(" ") ?? [];
  if ((kind !== "item" && kind !== "version") || id.length === 0) {
    return { kind: undefined, id: undefined, presses: 0 };
  }
  return { kind, id: id.join(" "), presses: Number(presses) || 0 };
}
