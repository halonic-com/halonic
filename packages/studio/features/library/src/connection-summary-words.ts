import type { ConnectorConnection } from "./connector-status-host.ts";

/** The words of the connector page's "How it connects" section: flow-library 5.4 and microcopy 11.2. */
export const connectionSummaryWords = {
  heading: "How it connects",
  transport: "Transport",
  /** The transport's name, as the New connector dialog words its ways. */
  transports: {
    google: "Gmail and Google Drive (built in)",
    http: "MCP over HTTP",
    stdio: "Local program (stdio)",
    integration: "Local integration",
    plugin: "Plugin",
  } satisfies Record<ConnectorConnection["kind"], string>,
  /** The label of the row that says where it connects to. */
  detail: {
    google: "Account",
    http: "URL",
    stdio: "Command",
    integration: "Folder",
    plugin: "Plugin",
  } satisfies Record<ConnectorConnection["kind"], string>,
  secrets: "Secrets",
  noSecrets: "none",
} as const;
