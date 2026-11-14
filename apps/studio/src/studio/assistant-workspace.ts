import { TauriDefinitionStore, type TauriFileShell } from "@halonicjs/adapter-fs-tauri";
import type { ServiceRegistry, WorkspaceScope } from "@halonicjs/app";
import { type DefinitionSource, isSecretName, type Secrets, secretKey } from "@halonicjs/ports";
import type {
  AssistantWorkspace,
  AssistantWorkspaceFacts,
} from "@halonicjs/studio-feature-settings";
import { AssistantWorkspaceService } from "@halonicjs/studio-feature-settings/api";
import { secretsKey } from "@halonicjs/studio-services";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";

/** What {@link OpenFolderAssistant} reads and listens to. */
export interface OpenFolderAssistantOptions {
  /** The folder's files. */
  readonly definitions: DefinitionSource;
  /** The folder's name, the one its heading says; used when `workspace.yaml` has no better. */
  readonly name: string;
  /** The keychain's secrets, or `undefined` where the app has none: the key line says it can't check. */
  readonly secrets?: Secrets | undefined;
  /** Calls `listener` when the folder's files change. Returns the function that stops it. */
  readonly onChange: (listener: () => void) => () => void;
  /** Where a failed read goes; the facts stay as they were. */
  readonly onError?: ((error: unknown) => void) | undefined;
}

/**
 * The folder open in a window, as Settings › Assistant reads it (`settings.ai-agent-key-line`): its
 * name, whether it is local only, the model it sets for its own chats, and which secret names its
 * providers use, from `workspace.yaml` and the provider files. A key's presence comes from the
 * keychain's `Secrets`; the value is read to know it is there and goes no further. It reads the
 * folder again whenever its files change, and says so to the listeners only when a fact differs.
 */
export class OpenFolderAssistant implements AssistantWorkspace {
  readonly #options: OpenFolderAssistantOptions;
  readonly #listeners = new Set<() => void>();
  #facts: Facts | null = null;
  #stop: (() => void) | undefined;
  #reading = 0;

  constructor(options: OpenFolderAssistantOptions) {
    this.#options = options;
    this.#stop = options.onChange(() => void this.refresh());
    void this.refresh();
  }

  current(): AssistantWorkspaceFacts | null {
    return this.#facts;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async keyStored(secretName: string): Promise<boolean> {
    const secrets = this.#options.secrets;
    if (secrets === undefined) throw new Error("This build has no keychain to ask.");
    return (await secrets.get(secretName)) !== null;
  }

  /** Reads the folder again. A read that a newer one overtakes is dropped. */
  async refresh(): Promise<void> {
    const mine = ++this.#reading;
    let facts: Facts;
    try {
      facts = await this.#read();
    } catch (error) {
      this.#options.onError?.(error);
      return;
    }
    if (mine !== this.#reading || this.#stop === undefined) return;
    const before = this.#facts;
    if (before?.sameAs(facts)) return;
    this.#facts = facts;
    for (const listener of [...this.#listeners]) listener();
  }

  /** Stops listening to the folder; later reads are dropped. */
  dispose(): void {
    this.#stop?.();
    this.#stop = undefined;
    this.#listeners.clear();
  }

  async #read(): Promise<Facts> {
    const loaded = await loadWorkspace(this.#options.definitions);
    const workspace = filesOf(loaded, "workspace")[0]?.value;
    const secrets = filesOf(loaded, "provider").flatMap((file) =>
      file.value.secret === undefined || !isSecretName(file.value.secret)
        ? []
        : [secretKey(file.value.secret)],
    );
    return new Facts(
      workspace?.name ?? this.#options.name,
      workspace?.privacy.localOnly ?? false,
      workspace?.assistant?.model ?? null,
      new Set(secrets),
    );
  }
}

/** One read of the folder. */
class Facts implements AssistantWorkspaceFacts {
  readonly name: string;
  readonly localOnly: boolean;
  readonly sessionModel: string | null;
  readonly secretKeys: ReadonlySet<string>;

  constructor(
    name: string,
    localOnly: boolean,
    sessionModel: string | null,
    secretKeys: ReadonlySet<string>,
  ) {
    this.name = name;
    this.localOnly = localOnly;
    this.sessionModel = sessionModel;
    this.secretKeys = secretKeys;
  }

  usesSecret(secretName: string): boolean {
    return isSecretName(secretName) && this.secretKeys.has(secretKey(secretName));
  }

  /** Whether another read says the same. */
  sameAs(other: Facts): boolean {
    return (
      this.name === other.name &&
      this.localOnly === other.localOnly &&
      this.sessionModel === other.sessionModel &&
      this.secretKeys.size === other.secretKeys.size &&
      [...this.secretKeys].every((key) => other.secretKeys.has(key))
    );
  }
}

/**
 * Gives the folder to Settings › Assistant (`settings.ai-agent-key-line`): its facts from its
 * files, read again when they change, and whether the keychain holds a key. Without the shell's
 * files there is nothing to read, so it gives nothing.
 */
export function provideAssistant(
  services: ServiceRegistry,
  files: TauriFileShell | undefined,
  location: string,
  name: string,
  scope: WorkspaceScope | undefined,
): OpenFolderAssistant | undefined {
  if (files === undefined) return undefined;
  const assistant = new OpenFolderAssistant({
    definitions: new TauriDefinitionStore(files, location),
    name,
    secrets: services.has(secretsKey) ? services.get(secretsKey) : undefined,
    onChange: (listener) => scope?.events.on("files.changed", listener) ?? (() => {}),
    onError: (error) => console.error(error),
  });
  services.provide(AssistantWorkspaceService, assistant);
  return assistant;
}
