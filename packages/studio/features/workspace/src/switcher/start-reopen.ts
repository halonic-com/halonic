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
    this.#set(reopening);
    reopening.done = open(() => !reopening.dropped).finally(() => {
      if (this.#current === reopening) this.#set(undefined);
    });
    return reopening.done;
  }

  /**
   * For a person's open of `location`: the reopen's end, with why it couldn't open, when it reopens
   * that folder; else `undefined`, having dropped any reopen, so the person's open goes ahead now.
   */
  join(location: string): Promise<WelcomeOpenProblem | undefined> | undefined {
    const reopening = this.#current;
    if (reopening === undefined) return undefined;
    if (reopening.location === location) return reopening.done;
    reopening.dropped = true;
    this.#set(undefined);
    return undefined;
  }

  #set(reopening: Reopening | undefined): void {
    this.#current = reopening;
    this.#onChange();
  }
}
