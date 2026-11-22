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
   * The lines around an HTTP connector's secret's `halonic secret set` command
   * (`library.http-connector-secret`, C565 #7, C618 #2). The desktop app's window connects to no
   * server over HTTP yet, so only `halonic run` and `halonic routines watch` read the secret; behind
   * `halonic serve`, the server's engine reads it from its own computer's secrets. Either way it is
   * the CLI's store, which Studio can neither write nor read (HAL-14995), so the page can't say Set
   * or Not set. `after` gives the CLI's other way, the variable, as its refusals word it.
   */
  httpSecret: {
    desktopApp: (secret: string) =>
      `Studio can't connect to a server over HTTP yet, so it doesn't use ${secret}. Runs started with halonic run or halonic routines watch do. Studio can't tell whether it's set for them. To save it, run this in a terminal:`,
    elsewhere: (secret: string) =>
      `Studio can't set ${secret}, or tell whether it's set. Halonic reads it from the secrets of the computer it runs on. To save it, run this in a terminal on that computer:`,
    after: {
      desktopApp: (variable: string) => `Or set ${variable} in the terminal you start them from.`,
      elsewhere: (variable: string) => `Or set ${variable} for Halonic on that computer.`,
    },
  },
} as const;
