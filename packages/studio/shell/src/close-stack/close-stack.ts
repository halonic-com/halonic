import { ShellError } from "../shell-error.ts";

/**
 * The kinds of layer that Esc (and Android's Back) close, in the order they
 * close: an inline edit first, the side panel last. A dialog and a sheet
 * share a rank.
 */
export const closeLayerKinds = [
  "inline-edit",
  "menu",
  "tooltip",
  "dialog",
  "sheet",
  "summary-drawer",
  "stacked-card",
  "docked-card",
  "maximise",
  "side-panel",
] as const;

/** A kind of layer in the close stack; see {@link closeLayerKinds} for the order. */
export type CloseLayerKind = (typeof closeLayerKinds)[number];

const rankOf: Readonly<Record<CloseLayerKind, number>> = {
  "inline-edit": 0,
  menu: 1,
  tooltip: 2,
  dialog: 3,
  sheet: 3,
  "summary-drawer": 4,
  "stacked-card": 5,
  "docked-card": 6,
  maximise: 7,
  "side-panel": 8,
};

/** Something open that Esc or Back can close. */
export interface CloseLayer {
  readonly kind: CloseLayerKind;
  /**
   * Closes the layer. Return `false` to refuse, for example a dialog with
   * typed text that asks first; the key press is used up either way.
   */
  close(): boolean | undefined;
  /**
   * Whether the layer counts right now. The side panel counts only while
   * focus is inside it. Always counts when left out.
   */
  isActive?(): boolean;
}

/** A key press as far as the close stack cares. */
export interface EscapePress {
  /** True while an input method is composing; Esc then belongs to it. */
  readonly isComposing?: boolean;
}

/**
 * The window's one close stack. Layers register when they open and leave
 * when they close. Esc and Android's Back both close the first layer by
 * rank, and within a rank the one opened last, so the two can't drift apart.
 */
export interface CloseStack {
  /** Registers an open layer. Returns a function to call when it closes; calling it twice is fine. */
  open(layer: CloseLayer): () => void;
  /**
   * Handles Esc: closes the first active layer. Returns whether a layer
   * took the key, so the frame can stop it from going further.
   */
  escape(press?: EscapePress): boolean;
  /**
   * Handles Android's Back the same way. Returns `false` when nothing was
   * open, so the app navigates back instead.
   */
  back(): boolean;
  /** The layer the next Esc would close, if any. */
  top(): CloseLayer | undefined;
}

interface Entry {
  readonly layer: CloseLayer;
  readonly order: number;
}

/**
 * Creates a window's close stack.
 *
 * @example
 * const stack = createCloseStack();
 * const leave = stack.open({ kind: "menu", close: () => { hideMenu(); return true; } });
 * stack.escape(); // hides the menu
 */
export function createCloseStack(): CloseStack {
  const entries: Entry[] = [];
  let opened = 0;

  const leave = (entry: Entry): void => {
    const index = entries.indexOf(entry);
    if (index !== -1) {
      entries.splice(index, 1);
    }
  };

  const first = (): Entry | undefined => {
    let best: Entry | undefined;
    for (const entry of entries) {
      if (entry.layer.isActive !== undefined && !entry.layer.isActive()) {
        continue;
      }
      if (best === undefined || closesBefore(entry, best)) {
        best = entry;
      }
    }
    return best;
  };

  const closeFirst = (): boolean => {
    const entry = first();
    if (entry === undefined) {
      return false;
    }
    if (entry.layer.close() !== false) {
      leave(entry);
    }
    return true;
  };

  return {
    open(layer) {
      if (!Object.hasOwn(rankOf, layer.kind)) {
        throw new ShellError(
          `closeStack.open: "${String(layer.kind)}" isn't a close layer kind. Use one of ${closeLayerKinds.join(", ")}.`,
        );
      }
      opened += 1;
      const entry: Entry = { layer, order: opened };
      entries.push(entry);
      return () => leave(entry);
    },
    escape(press = {}) {
      if (press.isComposing === true) {
        return false;
      }
      return closeFirst();
    },
    back: closeFirst,
    top: () => first()?.layer,
  };
}

function closesBefore(candidate: Entry, current: Entry): boolean {
  const candidateRank = rankOf[candidate.layer.kind];
  const currentRank = rankOf[current.layer.kind];
  if (candidateRank !== currentRank) {
    return candidateRank < currentRank;
  }
  return candidate.order > current.order;
}
