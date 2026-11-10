/** The toast's colour and icon, the same tones as the Status chip's. `info` is the accent. */
export type ToastTone = "success" | "info" | "running" | "warning" | "danger";

/** The toast's one action, a text button: "Undo", "Open run". Pressing it closes the toast. */
export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

/** What a screen shows: "Agent saved", "Run failed". */
export interface ToastMessage {
  readonly tone: ToastTone;
  readonly title: string;
  /** One line under the title, in `text-small`. */
  readonly text?: string;
  readonly action?: ToastAction;
}

/** A toast in the store, with the id `show` gave it. */
export interface Toast extends ToastMessage {
  readonly id: string;
}

/**
 * The toasts of one window: a plain store with no React and no knowledge of the shell, which
 * wraps it as its `toasts` service. One `ToastRegion` shows it.
 */
export interface ToastStore {
  /** Adds a toast at the bottom of the stack and returns its id, for `close`. */
  show(message: ToastMessage): string;
  close(id: string): void;
  /** Moves focus to the newest toast shown. The shell binds F6 to it. */
  focus(): void;
  /** Every toast, oldest first, shown or waiting. */
  list(): readonly Toast[];
  /** Calls `listener` after every change; returns the function that stops it. */
  subscribe(listener: () => void): () => void;
  /** For the ToastRegion: what `focus()` calls. Returns the function that unbinds it. */
  bindFocus(focus: () => void): () => void;
}

/**
 * Makes an empty toast store.
 *
 * @example
 * const toasts = createToastStore();
 * toasts.show({ tone: "success", title: "Agent saved" });
 * <ToastRegion store={toasts} />
 */
export function createToastStore(): ToastStore {
  let toasts: readonly Toast[] = [];
  let next = 0;
  let focusRegion: (() => void) | null = null;
  const listeners = new Set<() => void>();

  function set(value: readonly Toast[]) {
    toasts = value;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    show(message) {
      next += 1;
      const id = `toast-${next}`;
      set([...toasts, { ...message, id }]);
      return id;
    },
    close(id) {
      if (toasts.some((toast) => toast.id === id)) {
        set(toasts.filter((toast) => toast.id !== id));
      }
    },
    focus: () => focusRegion?.(),
    list: () => toasts,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bindFocus(focus) {
      focusRegion = focus;
      return () => {
        if (focusRegion === focus) {
          focusRegion = null;
        }
      };
    },
  };
}
