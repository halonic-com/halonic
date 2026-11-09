import type { ConnectorPin } from "./connector-client.ts";

/** Version of the {@link ToolApprovalStore} port. A breaking change bumps it and comes with an ADR. */
export const toolApprovalStoreVersion = 1;

/**
 * The address of the server a listed tool came from, as far as it can be
 * told apart without secrets. An approval holds only for the address it was
 * given at, so pointing the same source id at another server asks the
 * person again, even when the tools read the same.
 *
 * Every part is kept as the workspace writes it: a `${NAME}` reference stays
 * `${NAME}` and is never resolved, so rotating a secret asks nothing and no
 * secret value reaches the profile.
 *
 * - `http`: the connector's URL, normalised, without user name, password or
 *   fragment. The query string stays, because it is part of the server's
 *   identity. The headers count too, but only as their {@link WrittenDigest},
 *   because a person may have typed a token straight into one.
 * - `stdio`: the command and its arguments, the pin when the command is a
 *   package runner, else `null`, and the environment as its
 *   {@link WrittenDigest}, for the same reason. So a wrapper pointed at
 *   another server through its environment asks again.
 * - `integration`: the integration's id, its version and the settings the
 *   workspace gives it, such as the `url` of an MCP server. A new version
 *   asks again, because its reviewed code may talk to the server
 *   differently, and so do new settings.
 */
export type ToolServer =
  | { kind: "http"; url: string; headers: WrittenDigest | null }
  | {
      kind: "stdio";
      command: string;
      args: string[];
      pin: ConnectorPin | null;
      env: WrittenDigest | null;
    }
  | { kind: "integration"; id: string; version: string; settings: Record<string, unknown> };

/**
 * `sha256:` and the lowercase hex SHA-256 of a connector's headers or
 * environment, names and values as the workspace writes them, as canonical
 * JSON. `null` in a {@link ToolServer} when the workspace writes none. Only
 * the digest reaches the profile, never the text: changing a value typed in
 * directly asks again, rotating the secret behind a `${NAME}` reference
 * doesn't.
 */
export type WrittenDigest = `sha256:${string}`;

/** A listed tool's fingerprint: `htl1:` and the lowercase hex SHA-256 of the tool as canonical JSON. */
export type ListedToolFingerprint = `htl1:${string}`;

/** Which listed tool an approval is for. */
export interface ToolApprovalKey {
  /** The workspace's resolved real path, as in a `TrustRecord`. */
  location: string;
  /** The integration's or connector's id in the workspace. */
  source: string;
  /** The tool's name as the server listed it, without the source's id in front. */
  name: string;
}

/**
 * A listed tool as the model would see it: what `readToolListing` gives back
 * after its checks, with every untrusted text written as its plain text.
 * This is what a fingerprint covers and what the approval screen shows.
 */
export interface ListedToolText {
  /** The final name the model sees, with the source's id in front, such as "notes__lookup". */
  name: string;
  description: string;
  /** The rebuilt parameters, with every kept `description` and `title` as plain text. */
  parameters: Record<string, unknown>;
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
 *   server: { kind: "http", url: "https://notes.example.com/mcp", headers: null },
 *   fingerprint: "htl1:9f86d081884c7d65…",
 *   tool: {
 *     name: "notes__lookup",
 *     description: "Finds a note by its title.",
 *     parameters: { type: "object", properties: { title: { type: "string" } } },
 *   },
 *   approvedAt: "2026-11-09T10:00:00.000Z",
 * };
 */
export interface ToolApproval extends ToolApprovalKey {
  /** The address the tool was approved at. */
  server: ToolServer;
  /** The fingerprint of the tool as the person was shown it, such as "htl1:9f86d0…". */
  fingerprint: ListedToolFingerprint;
  /** The tool the fingerprint was computed from, so Studio can show what changed. */
  tool: ListedToolText;
  /** When the person approved it, as ISO text. */
  approvedAt: string;
}

/** One version of a listed tool that waited for approval. */
export interface WaitingVersion {
  fingerprint: ListedToolFingerprint;
  /** When the host first saw this version waiting, as ISO text. */
  firstSeenAt: string;
}

/**
 * The listed tools a person approved, in the user's profile next to the
 * trust records: the profile folder for the CLI and `serve`, the app data
 * folder for the desktop app, memory for tests and the browser demo.
 * **Never inside a workspace**, so a workspace can't arrive with its tools
 * already approved.
 *
 * The port only stores. `listedToolFingerprint` and `approveListedTools` in
 * `core/app` compute the fingerprint and decide which tools are offered.
 * Only a person writes approvals: no tool the model can call reaches this
 * store. An approval stays when its tool is no longer listed, so the tool
 * is on again if it comes back unchanged. Disconnecting a source revokes
 * all of its approvals.
 *
 * An approval that exists but can't be read makes `get` and `list` throw an
 * {@link UnreadableToolApprovalError}, never return `null` or skip it: the
 * host then offers none of that source's listed tools and tells the user
 * which approval it is. `revoke` still deletes it.
 */
export interface ToolApprovalStore {
  /** The approval for one listed tool, or `null` when there is none. */
  get(key: ToolApprovalKey): Promise<ToolApproval | null>;
  /**
   * Saves an approval, replacing any approval with the same key, and
   * forgets the tool's waiting versions.
   */
  approve(approval: ToolApproval): Promise<void>;
  /**
   * Deletes the approval for one listed tool, even one that can't be read,
   * and forgets its waiting versions. Revoking one that isn't there is not
   * an error.
   */
  revoke(key: ToolApprovalKey): Promise<void>;
  /**
   * Every approval for one source in one workspace, sorted by listed name
   * in UTF-16 code-unit order.
   *
   * @throws UnreadableToolApprovalError when any of them can't be read
   */
  list(location: string, source: string): Promise<ToolApproval[]>;
  /**
   * Notes that a version of a listed tool is waiting, and returns the
   * versions noted for that tool, oldest first. Noting a fingerprint that
   * is already there keeps its first `firstSeenAt`. The store keeps at most
   * the newest {@link maxWaitingVersions}, so a server that changes a tool
   * on every call can't fill the profile. The host uses them to stop asking
   * about a tool its server keeps changing.
   */
  noteWaiting(key: ToolApprovalKey, version: WaitingVersion): Promise<WaitingVersion[]>;
}

/**
 * What a {@link ToolApprovalStore} throws for an approval that exists but
 * can't be read: a damaged file, or one a newer Halonic wrote. It names the
 * approval's source and tool as fields, so Studio and the CLI can say which
 * approval it is in their own words. The message is for the log, not for a
 * person to read.
 *
 * Check for it with {@link isUnreadableToolApprovalError}, not `instanceof`:
 * an adapter may be built against its own copy of this package.
 *
 * @example
 * throw new UnreadableToolApprovalError(
 *   { location: "/workspaces/acme", source: "notes" },
 *   "lookup",
 *   "The approval for tool \"lookup\" can't be read.",
 *   { cause },
 * );
 */
export class UnreadableToolApprovalError extends Error {
  override readonly name = "UnreadableToolApprovalError";
  readonly location: string;
  readonly source: string;
  /** The tool's name as the server listed it, or `null` when the store can't tell which tool the approval is for. */
  readonly toolName: string | null;

  /**
   * @param where - the workspace and source the approval belongs to
   * @param toolName - the tool it is for, or `null` when that can't be read either
   * @param message - for the log
   * @param options - `cause` keeps the error this one wraps
   */
  constructor(
    where: { location: string; source: string },
    toolName: string | null,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.location = where.location;
    this.source = where.source;
    this.toolName = toolName;
  }
}

/**
 * Whether `value` is an {@link UnreadableToolApprovalError}: an `Error`
 * named "UnreadableToolApprovalError" with its fields. It works across
 * copies of this package, where `instanceof` doesn't.
 *
 * @example
 * const toolName = isUnreadableToolApprovalError(error) ? error.toolName : null;
 */
export function isUnreadableToolApprovalError(
  value: unknown,
): value is UnreadableToolApprovalError {
  if (!(value instanceof Error) || value.name !== "UnreadableToolApprovalError") return false;
  const fields = value as { location?: unknown; source?: unknown; toolName?: unknown };
  return (
    typeof fields.location === "string" &&
    typeof fields.source === "string" &&
    (typeof fields.toolName === "string" || fields.toolName === null)
  );
}

/** How many waiting versions of one listed tool a {@link ToolApprovalStore} keeps. */
export const maxWaitingVersions = 8;
