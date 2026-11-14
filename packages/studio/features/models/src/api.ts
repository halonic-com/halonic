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

/** One `providers/<id>.yaml`: where it is and its text. */
export interface ProviderFile {
  readonly path: string;
  readonly text: string;
}

/**
 * The open workspace's `models.yaml` and `providers/*.yaml` as the Models pages read and change it. The app provides it
 * for each open folder, over the workspace's files, so a change is unsaved, saved by itself and
 * undone with Ctrl Z like any other.
 */
export interface ModelsFiles {
  /** The text of `models.yaml` with unsaved changes applied; `null` when the workspace has none. */
  readModels(): Promise<string | null>;
  /** The files in `providers/` with unsaved changes applied, sorted by path. */
  readProviders(): Promise<ProviderFile[]>;
  /** Replaces the text of `models.yaml` as one undo step, named by `label`. */
  changeModels(label: string, text: string): void;
  /** Calls `listener` after `models.yaml` or a provider file may have changed; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

/** The workspace's `models.yaml`, provided by the app for each open folder. */
export const ModelsFilesService: ServiceKey<ModelsFiles> = serviceKey<ModelsFiles>("models.files");
