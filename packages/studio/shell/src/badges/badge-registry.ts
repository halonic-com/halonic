import type { StatusChipTone } from "@halonicjs/studio-kit";
import { ShellError } from "../shell-error.ts";

/**
 * A state the window's header badges show, such as "Not trusted yet" or "Needs sign-in". A feature
 * adds it while the state holds and removes it when the state is over.
 */
export interface BadgeState {
  /** Unique across features; a name of letters, digits and dashes, such as `workspace-trust`. */
  readonly id: string;
  /** The state, in words: colour is never alone. */
  readonly label: string;
  /** The chip's colour. */
  readonly tone: StatusChipTone;
  /** Higher shows first, so the most urgent state is leftmost. Ties go by `id`. */
  readonly priority: number;
  /**
   * What pressing the badge does, in words ("Review"). With it the badge is a button that calls
   * `onSelect`; without it the badge is only a chip.
   */
  readonly action?: string;
  /** Called with the badge's button when it is pressed, so the feature can give focus back to it. */
  readonly onSelect?: (opener: HTMLElement | null) => void;
  /** The line shown when the badge is hovered or focused. */
  readonly tooltip?: string;
}

/** The priority of the trust badge; connector states sit below it. */
export const trustBadgePriority = 1000;

/** The header badges: features add and remove states, the frame reads them in priority order. */
export interface BadgeRegistry {
  /**
   * Shows a state. Returns a function that removes it again.
   *
   * @throws ShellError when another state has this id
   */
  add(state: BadgeState): () => void;
  /** The states now, highest priority first, then by `id`. */
  list(): readonly BadgeState[];
  /** Calls `listener` whenever the list changes. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** Makes an empty registry. */
export function createBadgeRegistry(): BadgeRegistry {
  const states = new Map<string, BadgeState>();
  const listeners = new Set<() => void>();
  // Replaced on every change, so a React store sees a new array only when something changed.
  let sorted: readonly BadgeState[] = [];

  const changed = () => {
    sorted = [...states.values()].sort(
      (left, right) => right.priority - left.priority || left.id.localeCompare(right.id),
    );
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    add(state) {
      if (states.has(state.id)) {
        throw new ShellError(
          `badges.add: the badge "${state.id}" is already shown. Remove it first, or give the second one its own id.`,
        );
      }
      const entry = Object.freeze({ ...state });
      states.set(state.id, entry);
      changed();
      return () => {
        // A second call, or one after another state took the id, must not remove that state.
        if (states.get(state.id) === entry) {
          states.delete(state.id);
          changed();
        }
      };
    },
    list: () => sorted,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
