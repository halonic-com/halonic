import { keyDestination } from "@halonicjs/adapter-workspace-models";
import type { Provider } from "@halonicjs/format";
import type { KeyOrigins } from "@halonicjs/ports";
import type { AllowAddressResult, KeyAddresses } from "@halonicjs/studio-feature-models/api";

/**
 * The keychain's origins as the page uses them: read the list, and add one address to it. The
 * shell makes the origin from the address itself, so the page can store nothing but an origin.
 */
export type KeyOriginStore = KeyOrigins & {
  allowOrigin(name: string, address: string): Promise<AllowAddressResult>;
};

/**
 * The addresses each key in the OS keychain may be sent to (HAL-11872), for the key block on a
 * provider's page. The names are the ones `WorkspaceModelKeys` has already checked, so a
 * workspace can't reach Halonic's or a plugin's keys through them.
 */
export class WorkspaceKeyAddresses implements KeyAddresses {
  readonly #origins: KeyOriginStore;
  readonly #picked: (name: string) => string;

  /**
   * @param origins - the keychain's origins, from `shellKeyOrigins`
   * @param picked - the name rule of the workspace's keys, which throws for a name it refuses
   */
  constructor(origins: KeyOriginStore, picked: (name: string) => string) {
    this.#origins = origins;
    this.#picked = picked;
  }

  async allowed(secretName: string): Promise<readonly string[] | undefined> {
    return await this.#origins.allowedOrigins(this.#picked(secretName));
  }

  async allow(secretName: string, address: string): Promise<AllowAddressResult> {
    return await this.#origins.allowOrigin(this.#picked(secretName), address);
  }

  /** The model resolver's own answer, so the field offers exactly the address the key goes to. */
  usualAddress(provider: Pick<Provider, "id" | "type" | "baseUrl" | "secret">): string | undefined {
    const destination = keyDestination(provider);
    return destination?.isDefault === true ? destination.origin : undefined;
  }
}
