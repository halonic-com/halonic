import type { ConnectorAsks } from "./connector-status-host.ts";
import type { NewConnectorWay } from "./new-connector-host.ts";

/** The words of the New connector dialog: flow-library 3.3 and microcopy 11.2. */
export const newConnectorWords = {
  title: "New connector",
  name: "Name",
  nameMissing: "Give it a name.",
  hub: "Hub",
  way: "How it connects",
  wayMissing: "Choose how it connects.",
  ways: {
    google: "Gmail and Google Drive (built in)",
    http: "MCP server over HTTP",
    stdio: "Local program (stdio)",
  } satisfies Record<NewConnectorWay, string>,
  account: "Account",
  accountInvalid: "Enter the account's email address, like fin@acme.example.",
  url: "URL",
  urlInvalid: "Enter a full address, like https://mcp.example.com.",
  command: "Command",
  commandMissing: "Enter the command that starts the server.",
  secret: "Secret (optional)",
  secretInvalid: "Use letters, numbers and underscores, like NOTES_TOKEN.",
  secretHint: "The secret's name. Its value stays on this computer.",
  secretPassed: (name: string) =>
    `Passed to the program as ${name}. Its value stays on this computer.`,
  asksFirst:
    "Every tool this connector offers will ask a person first. You can change that in its file.",
  googleAsksFirst:
    "Tools that change or send something ask a person first. Reading and searching don't. You can change that in its file.",
  create: "Create",
  creating: "Creating…",
  retry: "Try again",
  file: (path: string) => `File: ${path}`,
  folder: (path: string) => `Folder: ${path}`,
  failed: (reason: string) => `Couldn't create the connector: ${reason}.`,
} as const;

/** The sentence that says which tools ask first, the same on the dialog and on the connector's page. */
export const asksFirstWords: Record<ConnectorAsks, string> = {
  "every-tool": newConnectorWords.asksFirst,
  changes: newConnectorWords.googleAsksFirst,
};
