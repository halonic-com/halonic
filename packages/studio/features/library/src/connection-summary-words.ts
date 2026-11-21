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
  /**
   * The line under an HTTP connector's secret, before the `halonic secret set` command
   * (`library.http-connector-secret`, C565 #7). The desktop app's window connects to no server over
   * HTTP yet, so only a run from a terminal reads the secret; behind `halonic serve`, the server's
   * engine reads it from its own computer's secrets. Either way it is the CLI's store, which Studio
   * can't write (HAL-14995).
   */
  httpSecret: {
    desktopApp: (secret: string) =>
      `Studio can't connect to a server over HTTP yet, so it doesn't use ${secret}. Runs from a terminal do. To set it for them, run this in a terminal:`,
    elsewhere: (secret: string) =>
      `Studio can't set ${secret}. Halonic reads it from the secrets of the computer it runs on. To set it, run this in a terminal on that computer:`,
  },
} as const;
