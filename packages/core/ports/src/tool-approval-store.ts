import type { ConnectorPin } from "./connector-client.ts";

/** Version of the {@link ToolApprovalStore} port. A breaking change bumps it and comes with an ADR. */
export const toolApprovalStoreVersion = 1;

/**
 * The server a listed tool came from, as far as it can be told apart without
 * secrets. It is part of what an approval's hash covers, so pointing the same
 * source id at another server asks the person again.
 *
 * - `http`: the connector's URL, normalised, without user name, password or
 *   fragment. Headers are left out, because they hold secrets.
 * - `stdio`: the command and its arguments, and the pin when the command is
 *   a package runner, else `null`. The environment is left out, because it
 *   holds secrets.
 * - `integration`: the integration's name and version, and the settings the
 *   workspace gives it, which are never secret values.
 */
export type ToolServer =
  | { kind: "http"; url: string }
  | { kind: "stdio"; command: string; args: string[]; pin: ConnectorPin | null }
  | {
      kind: "integration";
      name: string;
      version: string;
      settings: Readonly<Record<string, unknown>>;
    };

/** Which listed tool an approval is for. */
export interface ToolApprovalKey {
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  location: string;
  /** The integration's or connector's id in the workspace. */
  source: string;
  /** The tool's name as the server listed it, not the final name the model sees. */
  name: string;
}

/**
 * What Halonic keeps when a person approves one listed tool (requirement
 * `ports.listed-tool-approval`).
 *
 * @example
 * const approval: ToolApproval = {
 *   location: "/workspaces/acme",
 *   source: "notes",
 *   name: "lookup",
 *   hash: "htl1:9f86d081884c7d65…",
 *   approved: {
 *     server: { kind: "http", url: "https://notes.example.com/mcp" },
 *     description: "Finds a note by its title.",
 *     parameters: { type: "object", properties: { title: { type: "string" } } },
 *   },
 *   approvedAt: "2026-11-09T10:00:00.000Z",
 * };
 */
export interface ToolApproval extends ToolApprovalKey {
  /** The hash of the server and the tool as the person saw them, such as "htl1:9f86d0…". */
  hash: string;
  /**
   * The server, description and parameters the hash was computed from, as
   * the server sent them, so Studio can show what changed.
   */
  approved: { server: ToolServer; description: unknown; parameters: unknown };
  /** When the person approved it, as ISO text. */
  approvedAt: string;
}

/**
 * The listed tools a person approved, in the user's profile next to the
 * trust records: the profile folder for the CLI and `serve`, the app data
 * folder for the desktop app, memory for tests and the browser demo.
 * **Never inside a workspace**, so a workspace can't arrive with its tools
 * already approved.
 *
 * The port only stores approvals. `listedToolHash` and `gateToolListing` in
 * `core/app` compute the hash and decide which tools are offered. Only a
 * person writes approvals: no tool the model can call reaches this store.
 * When a tool is no longer listed, or the person rejects a changed one, the
 * host revokes its approval, so the same name coming back is asked about
 * again.
 *
 * An approval that exists but can't be read makes `get` and `list` throw,
 * never return `null` or skip it: the host then offers none of that
 * source's listed tools and tells the user why. The error names the
 * approval's key, and `revoke` still deletes it.
 */
export interface ToolApprovalStore {
  /** The approval for one listed tool, or `null` when there is none. */
  get(key: ToolApprovalKey): Promise<ToolApproval | null>;
  /** Saves an approval, replacing any approval with the same key. */
  approve(approval: ToolApproval): Promise<void>;
  /**
   * Deletes the approval for one listed tool, even one that can't be read.
   * Revoking one that isn't there is not an error.
   */
  revoke(key: ToolApprovalKey): Promise<void>;
  /**
   * Every approval for one source in one workspace, sorted by listed name.
   *
   * @throws when any of them can't be read, naming its key
   */
  list(location: string, source: string): Promise<ToolApproval[]>;
}
