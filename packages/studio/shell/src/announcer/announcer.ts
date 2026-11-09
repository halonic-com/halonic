import { ShellError } from "../shell-error.ts";
import { type AnnouncerTimers, systemTimers } from "./timers.ts";

/** How urgently a screen reader reads an announcement. */
export type Politeness = "polite" | "assertive";

/**
 * One `aria-live` region, as the frame or a modal mounts it. `say` clears the
 * region and sets the text on the next frame, so the same text is read again.
 */
export interface LiveRegion {
  say(text: string): void;
}

/**
 * A polite and an assertive region. The assertive one has
 * `aria-live="assertive"` and no `role="alert"`, so it isn't read twice.
 */
export interface LiveRegions {
  readonly polite: LiveRegion;
  readonly assertive: LiveRegion;
}

/** Options for {@link Announcer.announce} and {@link Announcer.announceState}. */
export interface AnnounceOptions {
  /** Hold the announcement until the Studio window has focus, for example after a browser sign-in. */
  readonly whenWindowFocused?: boolean;
}

/**
 * The window's screen reader announcements. There is one per window, not per
 * workspace, so it keeps announcing while you switch workspaces.
 */
export interface Announcer {
  /**
   * Reads `text` once. The same text within 2 s is read only once; asked
   * for politely and assertively before it is read, it is read assertively.
   *
   * @throws ShellError when `text` is empty
   */
  announce(text: string, politeness?: Politeness, options?: AnnounceOptions): void;
  /**
   * Reads a state that may change quickly, such as `run:43`. It waits until
   * 2 s pass without a call for the same key, then reads the last text politely.
   *
   * @throws ShellError when `key` or `text` is empty
   */
  announceState(key: string, text: string, options?: AnnounceOptions): void;
  /**
   * Mounts the frame's own regions, once at start-up. Announcements made
   * before that are read when it happens. Returns a function that unmounts them.
   *
   * @throws ShellError when regions are already mounted
   */
  mountRegions(regions: LiveRegions): () => void;
  /**
   * Routes announcements into an open modal's regions, because screen
   * readers ignore everything outside an `aria-modal` dialog. The topmost
   * modal wins. Returns a function to call when the modal closes.
   */
  pushModalRegions(regions: LiveRegions): () => void;
  /** Tells the announcer whether the Studio window has focus. */
  setWindowFocused(focused: boolean): void;
  /** Cancels every pending announcement and timer, when the window closes. */
  dispose(): void;
}

/** Options for {@link createAnnouncer}. */
export interface AnnouncerOptions {
  /** The timers to use; tests pass fake ones. Defaults to the system's. */
  readonly timers?: AnnouncerTimers;
  /** Whether the window has focus at start-up. Defaults to `true`. */
  readonly windowFocused?: boolean;
}

/** How long the same text, or the same state key, is held back. */
export const announceQuietMs = 2000;

interface Pending {
  politeness: Politeness;
  readonly whenWindowFocused: boolean;
}

/**
 * Creates a window's announcer. Announcements are collected and read on the
 * next timer tick, so a polite and an assertive request for the same text
 * made together are read once, assertively.
 *
 * @example
 * const announcer = createAnnouncer();
 * announcer.mountRegions({ polite, assertive });
 * announcer.announce("Saved.");
 */
export function createAnnouncer(options: AnnouncerOptions = {}): Announcer {
  return new WindowAnnouncer(options.timers ?? systemTimers, options.windowFocused ?? true);
}

class WindowAnnouncer implements Announcer {
  private ownRegions: LiveRegions | undefined;
  private readonly modalRegions: LiveRegions[] = [];
  /** Texts waiting to be read, in the order they were first asked for. */
  private readonly pending = new Map<string, Pending>();
  /** When each text was last read, to drop repeats within the quiet time. */
  private readonly lastRead = new Map<string, number>();
  private readonly stateTimers = new Map<string, unknown>();
  private flushTimer: unknown;

  private readonly timers: AnnouncerTimers;
  private windowFocused: boolean;

  constructor(timers: AnnouncerTimers, windowFocused: boolean) {
    this.timers = timers;
    this.windowFocused = windowFocused;
  }

  announce(text: string, politeness: Politeness = "polite", options: AnnounceOptions = {}): void {
    requireText(text, "announce", "text");
    const earlier = this.pending.get(text);
    if (earlier === undefined) {
      this.pending.set(text, {
        politeness,
        whenWindowFocused: options.whenWindowFocused ?? false,
      });
    } else if (politeness === "assertive") {
      earlier.politeness = "assertive";
    }
    this.scheduleFlush();
  }

  announceState(key: string, text: string, options: AnnounceOptions = {}): void {
    requireText(key, "announceState", "key");
    requireText(text, "announceState", "text");
    this.timers.clearTimeout(this.stateTimers.get(key));
    const timer = this.timers.setTimeout(() => {
      this.stateTimers.delete(key);
      this.announce(text, "polite", options);
    }, announceQuietMs);
    this.stateTimers.set(key, timer);
  }

  mountRegions(regions: LiveRegions): () => void {
    if (this.ownRegions !== undefined) {
      throw new ShellError(
        "The announcer's regions are already mounted. The frame mounts them once per window.",
      );
    }
    this.ownRegions = regions;
    this.scheduleFlush();
    return () => {
      if (this.ownRegions === regions) {
        this.ownRegions = undefined;
      }
    };
  }

  pushModalRegions(regions: LiveRegions): () => void {
    this.modalRegions.push(regions);
    return () => {
      const index = this.modalRegions.lastIndexOf(regions);
      if (index !== -1) {
        this.modalRegions.splice(index, 1);
      }
    };
  }

  setWindowFocused(focused: boolean): void {
    this.windowFocused = focused;
    if (focused) {
      this.scheduleFlush();
    }
  }

  dispose(): void {
    this.timers.clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    for (const timer of this.stateTimers.values()) {
      this.timers.clearTimeout(timer);
    }
    this.stateTimers.clear();
    this.pending.clear();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== undefined) {
      return;
    }
    this.flushTimer = this.timers.setTimeout(() => this.flush(), 0);
  }

  /** Reads what is pending into the topmost regions, skipping recent repeats. */
  private flush(): void {
    this.flushTimer = undefined;
    const regions = this.modalRegions.at(-1) ?? this.ownRegions;
    if (regions === undefined) {
      return;
    }
    const now = this.timers.now();
    forgetOlderThan(this.lastRead, now - announceQuietMs);
    for (const [text, request] of this.pending) {
      if (request.whenWindowFocused && !this.windowFocused) {
        continue;
      }
      this.pending.delete(text);
      if (this.lastRead.has(text)) {
        continue;
      }
      this.lastRead.set(text, now);
      regions[request.politeness].say(text);
    }
  }
}

function requireText(value: string, method: string, name: string): void {
  if (value.trim() === "") {
    throw new ShellError(`${method} needs a non-empty ${name}.`);
  }
}

/** Drops the texts last read at or before `cutoff`, so the map stays small. */
function forgetOlderThan(lastRead: Map<string, number>, cutoff: number): void {
  for (const [text, readAt] of lastRead) {
    if (readAt <= cutoff) {
      lastRead.delete(text);
    }
  }
}
