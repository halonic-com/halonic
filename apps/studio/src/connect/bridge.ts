/**
 * What the connect page asks of the Android shell. The shell's Rust
 * `connect` command checks the address after DNS, makes the hello call and
 * compares versions (crate `halonic-connect`); the page only shows the
 * outcome, in its own words. Keeping this one small interface lets the
 * tests drive every screen without the shell.
 */
export interface ConnectBridge {
  /** Checks `address` as typed and makes the hello call. */
  connect(address: string): Promise<ConnectResult>;
  /** Opens the confirmed address in the app window. */
  openStudio(url: string): void;
  /** Opens the release page in the phone's browser, not in the app window. */
  openReleasePage(): Promise<void>;
}

/**
 * One outcome of {@link ConnectBridge.connect}, in the order the spec checks
 * them. `address` is the address as typed, normalised for display, for
 * example `192.168.1.20:4280`; versions are the computer's.
 */
export type ConnectResult =
  | { readonly kind: "connected"; readonly url: string }
  | { readonly kind: "notAnAddress" }
  | { readonly kind: "notHomeNetwork" }
  | { readonly kind: "notAnswering"; readonly address: string }
  | { readonly kind: "notHalonic"; readonly address: string }
  | { readonly kind: "appTooOld"; readonly computerVersion: string }
  | { readonly kind: "computerTooOld"; readonly computerVersion: string };

/**
 * Where the page remembers the address. It is the only thing the shell
 * stores: no key, token, password or cookie (flow 5.3, Julian's checklist).
 */
export interface AddressStore {
  load(): string | undefined;
  save(address: string): void;
}

const storageKey = "halonic.connect.address";

/** The page's own storage on the phone. */
export function localAddressStore(storage: Storage): AddressStore {
  return {
    load: () => storage.getItem(storageKey) ?? undefined,
    save: (address) => storage.setItem(storageKey, address),
  };
}
