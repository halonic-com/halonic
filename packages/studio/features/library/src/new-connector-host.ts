import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** The ways a new connector can reach its tools. */
export type NewConnectorWay = "google" | "http" | "stdio";

/** What a person fills in to make a connector. Only the fields of the picked way are used. */
export interface NewConnectorDraft {
  readonly name: string;
  /** The hub folder the connector belongs to, or `null` to share it at the workspace root. */
  readonly hub: string | null;
  readonly way: NewConnectorWay;
  /** Gmail and Google Drive: the account's email address. */
  readonly account: string;
  /** MCP over HTTP: the server's address. */
  readonly url: string;
  /** Local program: the line that starts it, such as `npx -y @acme/notes-mcp`. */
  readonly command: string;
  /** The name of a secret, never its value; empty for none. The bearer token (HTTP) or the program's variable. */
  readonly secret: string;
}

/** A hub a new connector can go in. */
export interface NewConnectorHub {
  readonly id: string;
  readonly name: string;
}

/** Which connector: its id, and the hub it sits in, or `null` when the workspace shares it. */
export interface ConnectorRef {
  readonly hub: string | null;
  readonly id: string;
}

/** Makes connectors in the open workspace. The app provides it for each open workspace. */
export interface NewConnectorHost {
  /** Reads the workspace, so `hubs` and `file` are current. The place waits for it before it opens the dialog. */
  prepare(): Promise<void>;
  /** The hubs of the workspace, for the dialog's Hub field. */
  hubs(): readonly NewConnectorHub[];
  /** The ways the dialog offers, in the order it shows them. */
  ways(): readonly NewConnectorWay[];
  /**
   * Where the connector's file would be, from the workspace folder:
   * `hubs/acme/library/connectors/notes.connector.yaml`. With an empty name it is the folder that
   * holds the connectors, ending in `/` (`core`'s `newLibraryFile` makes the path).
   */
  file(draft: Pick<NewConnectorDraft, "name" | "hub">): string;
  /**
   * Makes the connector as one change that shows in Changes. It never connects or starts
   * anything. Rejects with an `Error` of one sentence when it can't.
   */
  create(draft: NewConnectorDraft): Promise<ConnectorRef>;
}

export const NewConnectorHostService: ServiceKey<NewConnectorHost> =
  serviceKey<NewConnectorHost>("library.new-connector");
