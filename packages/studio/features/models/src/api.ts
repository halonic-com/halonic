/**
 * The services and types other features may use. Features import each
 * other only through this file. Settings › Assistant and the status bar
 * reach the Models feature through `ModelsService`.
 */
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** Where on a provider's page the Studio should land. */
export type ProviderPageTarget = "page" | "key";

/**
 * The open workspace's models, as other features may use them. Reads and
 * links only: keys and settings change on the Models pages, never from
 * another feature.
 */
export interface Models {
  /** Whether a key is stored under the secret name. It never returns the key. */
  keyStored(secretName: string): Promise<boolean>;
  /** Opens the page of the provider that uses the secret name, at its key block. */
  openProviderPage(secretName: string, target?: ProviderPageTarget): void;
  /** Opens the alias tab for the alias, with its price field focused when `focusPrice` is set. */
  openAlias(name: string, options?: { readonly focusPrice?: boolean }): void;
  /** Scrolls the workspace page to the Budget block and puts focus on its heading. */
  openBudget(): void;
}

/** The open workspace's models. The Models feature provides it for each open workspace. */
export const ModelsService: ServiceKey<Models> = serviceKey<Models>("models");
