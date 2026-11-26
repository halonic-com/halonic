import type { WelcomeOpenProblem } from "@halonicjs/studio-shell";

/** The reopen under way: its folder, whether a person's open dropped it, and its end. */
interface Reopening {
  readonly location: string;
  dropped: boolean;
  done: Promise<WelcomeOpenProblem | undefined>;
}

/**
 * The window's reopen, at start, of the workspace it showed (`workspace.reopen-gives-way`).
 * It runs beside the person rather than in their way (HAL-19958): an open the person starts while it
 * runs waits for it when it is the same folder, so the folder opens once, and else drops it, so
 * the reopened workspace doesn't show over theirs.
 *
 * @example
 * const reopen = new StartReopen(notify);
 * void reopen.run("/work/acme", (wanted) => openUnlessDropped("/work/acme", wanted));
 * reopen.join("/work/beta"); // drops the reopen of acme
 */
export class StartReopen {
  readonly #onChange: () => void;
  #current: Reopening | undefined;
  /** Every reopen that hasn't ended, dropped ones included, so a later open can take one back. */
  readonly #running = new Set<Reopening>();

  /** `onChange` is called whenever {@link location} changes. */
  constructor(onChange: () => void) {
    this.#onChange = onChange;
  }

  /** The folder being reopened, until the reopen ends or a person's open drops it. */
  get location(): string | undefined {
    return this.#current?.location;
  }

  /**
   * Reopens `location` with `open`, which gets whether its workspace is still wanted once it has
   * opened. Does nothing while another reopen runs.
   */
  run(
    location: string,
    open: (wanted: () => boolean) => Promise<WelcomeOpenProblem | undefined>,
  ): Promise<WelcomeOpenProblem | undefined> {
    if (this.#current !== undefined) {
      return Promise.resolve(undefined);
    }
    const reopening: Reopening = { location, dropped: false, done: Promise.resolve(undefined) };
    this.#running.add(reopening);
    this.#set(reopening);
    reopening.done = open(() => !reopening.dropped).finally(() => {
      this.#running.delete(reopening);
      if (this.#current === reopening) this.#set(undefined);
    });
    return reopening.done;
  }

  /**
   * For a person's open of `location`: the reopen's end, with why it couldn't open, when a reopen
   * of that folder hasn't ended, taking it back if an earlier open dropped it, so the folder never
   * opens twice at once; else `undefined`, having dropped any reopen, so the person's open goes
   * ahead now.
   */
  join(location: string): Promise<WelcomeOpenProblem | undefined> | undefined {
    const same = [...this.#running].find((reopening) => reopening.location === location);
    if (this.#current !== undefined && this.#current !== same) this.#current.dropped = true;
    if (same === undefined) {
      if (this.#current !== undefined) this.#set(undefined);
      return undefined;
    }
    same.dropped = false;
    if (this.#current !== same) this.#set(same);
    return same.done;
  }

  #set(reopening: Reopening | undefined): void {
    this.#current = reopening;
    this.#onChange();
  }
}
