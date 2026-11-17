/**
 * The services and types other features may use. Features import each
 * other only through this file. Settings › Assistant and the status bar
 * reach the Models feature through `ModelsService`.
 */
import type { SecretText } from "@halonicjs/studio-kit";
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
  /** The text of one provider file with unsaved changes applied; `null` when it is gone. */
  readProvider(path: string): Promise<string | null>;
  /** The text of `workspace.yaml` (for its budget and currency); `null` when the workspace has none. */
  readWorkspace(): Promise<string | null>;
  /** Replaces the text of `models.yaml` as one undo step, named by `label`. */
  changeModels(label: string, text: string): void;
  /** Replaces the text of `workspace.yaml` as one undo step, named by `label`. */
  changeWorkspace(label: string, text: string): void;
  /** Replaces the text of the provider file at `path` as one undo step, named by `label`. */
  changeProvider(path: string, label: string, text: string): void;
  /** Calls `listener` after `models.yaml` or a provider file may have changed; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}

/** The workspace's `models.yaml`, provided by the app for each open folder. */
export const ModelsFilesService: ServiceKey<ModelsFiles> = serviceKey<ModelsFiles>("models.files");

/**
 * Where an API key can be typed on a provider's page. The host knows how Studio reaches it, so the
 * page never guesses from the address bar.
 */
export type KeyEntry =
  /**
   * The field is there. `keptOn` says which computer keeps the key. `offHostHttps` is set on a
   * served page opened from another device over https: the page says the key crosses the network
   * encrypted and still names the host command.
   */
  | {
      readonly kind: "field";
      readonly keptOn: "this-computer" | "host-computer";
      readonly offHostHttps: boolean;
    }
  /**
   * There is no field. `demo`: the browser demo keeps no keys. `no-password`: `serve` has no
   * password, so another device can't enter keys. `unencrypted`: another device over plain http,
   * which the server refuses (`server.secrets-refusals`). The page shows the host command instead.
   */
  | { readonly kind: "unavailable"; readonly reason: "demo" | "no-password" | "unencrypted" };

/**
 * The API keys of the open workspace's providers, write-only: no method returns a key. The app
 * provides it for each open workspace (the keychain on desktop, the host's key routes when served).
 * A Studio without it shows no key block.
 */
export interface ModelKeys {
  /** How a key can be entered here. It doesn't change while the workspace is open. */
  readonly entry: KeyEntry;
  /** Whether a key is stored under the secret name. */
  stored(secretName: string): Promise<boolean>;
  /** Stores the key under the secret name, replacing any. It rejects when it can't; the key is never in the error. */
  save(secretName: string, key: SecretText): Promise<void>;
  /** Deletes the key under the secret name. It rejects when it can't. */
  remove(secretName: string): Promise<void>;
}

/** The workspace's API keys, provided by the app for each open folder. It is optional. */
export const ModelKeysService: ServiceKey<ModelKeys> = serviceKey<ModelKeys>("models.keys");

/**
 * Which providers the user chose "No limit" for, on this device. It is remembered per workspace,
 * provider and the provider's host (such as `api.openai.com`), never the computer running Halonic,
 * so a second device asks again and a provider that moves to a new host asks again.
 */
export interface NoLimitMemory {
  /** Whether "No limit" is remembered for the provider at the host. */
  remembered(providerId: string, host: string): boolean;
  /** Remembers "No limit" for the provider at the host. */
  remember(providerId: string, host: string): void;
}

/** The "No limit" answers of this device, provided by the app for each open folder. It is optional. */
export const NoLimitMemoryService: ServiceKey<NoLimitMemory> =
  serviceKey<NoLimitMemory>("models.no-limit");

/**
 * Asks a provider that runs on this computer or your own network whether it is answering now. The
 * app provides it for each open folder, from the computer Studio runs on (a phone asks the
 * computer). A Studio without it shows no Check button.
 */
export interface ProviderCheck {
  /**
   * Where the provider is reached, such as `localhost:11434`: its `baseUrl`, or its type's usual
   * address. `undefined` when it has neither, so there is nothing to check.
   */
  addressOf(provider: {
    readonly type: string;
    readonly baseUrl?: string | undefined;
  }): string | undefined;
  /** Whether the provider answers now. It resolves `false` for any failure and never rejects. */
  isAnswering(provider: {
    readonly type: string;
    readonly baseUrl?: string | undefined;
  }): Promise<boolean>;
}

/** The provider check of the open folder. It is optional. */
export const ProviderCheckService: ServiceKey<ProviderCheck> =
  serviceKey<ProviderCheck>("models.provider-check");

/**
 * Loads the Settings › Models view, for the CI screenshots (`docs/guides/e2e-screenshots.md`),
 * which draw it with made-up data. The app never calls it: the feature registers the section itself.
 */
export const loadModelsSettingsSection = () => import("./settings/models-settings-section.tsx");
