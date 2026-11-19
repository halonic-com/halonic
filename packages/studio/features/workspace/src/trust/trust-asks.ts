/** How a person answered the trust check a start asked for. */
export type TrustAnswer = "trusted" | "declined";

/**
 * The way a start that was refused because the workspace isn't trusted yet opens the window's
 * trust check (`workspace.trust-asked`): Routines' Run now, the Run panel's and the run page's
 * **Review**. The window's trust badge shows the check; until it does, nothing can, and every ask
 * answers `"declined"` at once.
 *
 * @example
 * const asks = new TrustAsks();
 * const stop = asks.showWith(async () => "trusted"); // the badge, while it is mounted
 * await asks.ask(); // "trusted"
 */
export class TrustAsks {
  #show: (() => Promise<TrustAnswer>) | undefined;

  /** Opens the trust check; answers `"trusted"` once the person trusted it, else `"declined"`. */
  ask(): Promise<TrustAnswer> {
    return this.#show?.() ?? Promise.resolve("declined");
  }

  /** Makes `show` the way the check opens; returns the way to stop. */
  showWith(show: () => Promise<TrustAnswer>): () => void {
    this.#show = show;
    return () => {
      if (this.#show === show) this.#show = undefined;
    };
  }
}
