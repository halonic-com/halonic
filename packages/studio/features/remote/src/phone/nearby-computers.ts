/**
 * The typed route's computer picker as it lists the Halonic computers on this Wi-Fi (shape agreed
 * with Priya on HAL-16829). The Android shell browses with `NsdManager` and keeps each computer's
 * address and port (`phone_nearby_browse`, HAL-16824): the page gets names and opaque ids only,
 * and pairs with an id (`TunnelPairingStart`'s `nearby` form).
 */

/**
 * A computer found on this Wi-Fi, named by the shell. The same advert keeps the same id on every
 * browse for as long as the app runs, so a picked computer survives a browse that starts again.
 * An id whose computer is no longer listed answers a pairing with `cant-reach` / `unreachable`.
 */
export type NearbyId = string & { readonly __nearby: unique symbol };

/** A computer on this Wi-Fi, as the picker lists it. */
export interface NearbyComputer {
  readonly id: NearbyId;
  /** The computer's name from its advert, cleaned by the same rules as the pairing name. */
  readonly name: string;
}

/**
 * How a browse started: `browsing`; `no-local-network` with the same meaning as the tunnel's
 * (`askAgain` while Android would still ask); or `unavailable` when this isn't the Android app or
 * Android's search couldn't start.
 */
export type NearbyStart =
  | { readonly kind: "browsing" }
  | { readonly kind: "no-local-network"; readonly askAgain: boolean }
  | { readonly kind: "unavailable" };

/** The most computers the picker lists; the shell keeps no more, and the page checks again. */
export const MAX_NEARBY = 20;

/** The phone's list of Halonic computers on this Wi-Fi, while the picker is open. */
export interface NearbyComputers {
  /**
   * Starts listing the Halonic computers on this Wi-Fi, asking Android's Nearby devices question
   * first. `onChange` gets the whole list at once, sorted by name: first an empty one once
   * browsing starts, then again on every change. While the app is in the background the list is
   * empty, and it fills again when the app comes back. One browse at a time: a new one replaces
   * the last.
   *
   * `onChange` is never called again once {@link stop} is called or a newer browse starts, and
   * never at all when the answer is `no-local-network` or `unavailable`. A {@link stop} that comes
   * while Android's question is still showing keeps the browse from starting; the answer still
   * comes, and the picker ignores it.
   */
  browse(onChange: (computers: readonly NearbyComputer[]) => void): Promise<NearbyStart>;
  /**
   * The picker closed. The computers it listed stay pairable by id until the next browse, which
   * names each again once its computer is found again.
   */
  stop(): Promise<void>;
}
