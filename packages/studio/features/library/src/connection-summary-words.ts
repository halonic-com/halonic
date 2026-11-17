import type { ConnectorConnection } from "./connector-status-host.ts";
import { newConnectorWords } from "./new-connector-words.ts";

/** The words of the connector page's "How it connects" section: flow-library 5.4 and microcopy 11.2. */
export const connectionSummaryWords = {
  heading: "How it connects",
  transport: "Transport",
  /** The transport's name, as the New connector dialog words its ways. */
  transports: {
    google: newConnectorWords.ways.google,
    http: newConnectorWords.ways.http,
    stdio: newConnectorWords.ways.stdio,
    integration: "Local integration",
    plugin: "Plugin",
  } satisfies Record<ConnectorConnection["kind"], string>,
  /** The label of the row that says where it connects to. */
  detail: {
    google: "Account",
    http: "URL",
    stdio: "Command",
    integration: "Folder",
    /** A plugin's row: its display name, or its id when it has no name. */
    pluginName: "Name",
    pluginId: "ID",
  },
  secrets: "Secrets",
  noSecrets: "none",
} as const;
