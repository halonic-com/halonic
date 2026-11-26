// The built-in `paperclip` connector of `halonic serve` (`cli.serve-paperclip-tools`, HAL-19721):
// a served routine's tool steps reach Paperclip only through it, over one of the workspace's
// Paperclip connections and the key its owner stored in the serve profile
// (`server.paperclip-key-store`). The workspace names the connection, never a key.

import { PaperclipTaskTools } from "@halonicjs/adapter-paperclip-client";
import type {
  ConnectorClient,
  ConnectorConfig,
  ConnectorFactory,
  ConnectorFactoryContext,
  SecretStore,
} from "@halonicjs/ports";
import { readConnectionFile, readStoredKey, storedKeyGuard } from "./serve-messaging.ts";

/** What {@link ServePaperclipTools} needs. */
export interface ServePaperclipToolsOptions {
  /** The engine workspace's real path; it holds the connection files and never a key. */
  readonly workspace: string;
  /** The serve profile's own secrets file, read at every call. */
  readonly keys: Pick<SecretStore, "get">;
  /** The `fetch` Paperclip is called with; the global one by default. */
  readonly fetch?: typeof fetch;
}

/**
 * Makes the `paperclip` connectors of the served workspace. Each call takes the connection's
 * stored key again, through the same key guard as the server's messaging: no key, or a
 * connection file that no longer matches what the key was made for, and the call fails as
 * `signed-out` with nothing sent. Writes are listed and made only for a trusted workspace.
 */
export class ServePaperclipTools implements ConnectorFactory {
  readonly transport = "paperclip";
  readonly #options: ServePaperclipToolsOptions;

  constructor(options: ServePaperclipToolsOptions) {
    this.#options = options;
  }

  create(config: ConnectorConfig, context: ConnectorFactoryContext): ConnectorClient {
    if (config.transport.kind !== "paperclip") {
      throw new Error(`Connector "${config.id}" isn't a Paperclip connector.`);
    }
    const { connection } = config.transport;
    const { workspace, keys, fetch } = this.#options;
    return new PaperclipTaskTools({
      id: config.id,
      trusted: context.trust !== null,
      open: async () => {
        const madeFor = await readStoredKey(keys, connection);
        const file = await readConnectionFile(workspace, connection);
        if (madeFor === undefined || file === undefined) return undefined;
        return {
          address: madeFor.address,
          key: storedKeyGuard(workspace, keys, connection, madeFor),
          company: madeFor.company,
          ...(fetch === undefined ? {} : { fetch }),
        };
      },
    });
  }
}
