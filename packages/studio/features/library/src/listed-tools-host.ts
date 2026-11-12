import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** One argument of a listed tool, as a line "Arguments: id (string): the note's id". */
export interface ListedToolArgument {
  readonly name: string;
  /** Its type, when the server gave one. */
  readonly type?: string;
  readonly description?: string;
}

/** Why a person might not see a change: another alphabet, another way of writing, or only spaces. */
export type ListedToolHiddenChange = "lookalike" | "normalization" | "whitespace";

/** One text of a tool that changed since it was approved. */
export interface ListedToolDifference {
  /** Where the text is, such as `description` or `parameters/properties/id/description`. */
  readonly path: string;
  /** The text as approved, or `null` when it is new. */
  readonly before: string | null;
  /** The text now, or `null` when it was removed. */
  readonly after: string | null;
  /** Why the change can't be seen, or `null` when it shows. */
  readonly hidden: ListedToolHiddenChange | null;
}

/** One listed tool that waits for a decision, as the screen shows it. */
export interface ListedToolRow {
  /** The name its server lists it under, as the screen shows it. */
  readonly name: string;
  /** The version shown. The host approves exactly this version and no other. */
  readonly fingerprint: string;
  readonly description: string;
  readonly arguments: readonly ListedToolArgument[];
  /** `changed` when it was approved before, `not_approved` when it never was or its approval was removed. */
  readonly state: "changed" | "not_approved";
  /** What changed since the approval. Empty when it was never approved, or only its server changed. */
  readonly differences: readonly ListedToolDifference[];
  /** Its text is the same, but its server's address, version or settings changed. */
  readonly serverChanged: boolean;
  /** One reason for each part of its arguments Halonic left out. */
  readonly leftOutArguments: readonly string[];
}

/** A tool Halonic refused while reading the listing: shown as plain text, never approvable. */
export interface RefusedListedToolRow {
  readonly name: string;
  readonly reason: string;
}

/** One connector's listed tools, ready to review. */
export interface ListedToolsSnapshot {
  /** The connector's name, as on its card. */
  readonly sourceName: string;
  /** The tools to ask about: Changed first, then Not approved. */
  readonly toReview: readonly ListedToolRow[];
  /** Tools its server keeps changing: shown, never asked about, never approved by "Approve all". */
  readonly keepsChanging: readonly ListedToolRow[];
  readonly refused: readonly RefusedListedToolRow[];
  /** The names of the listed tools that are on. */
  readonly approved: readonly string[];
  /** Why Halonic refused the whole listing, or `null`. */
  readonly listingRefused: string | null;
  /** An approval that can't be read, so none of the listed tools is on, or `null`. `toolName` is absent until the service gives it. */
  readonly unreadable: { readonly toolName?: string } | null;
  /** At least one tool was approved before. Without it, every row on the first screen is "Not approved" and shows no chip. */
  readonly hasApprovals: boolean;
}

/** A tool to approve, at the version the person was shown. */
export interface ListedToolPick {
  readonly name: string;
  readonly fingerprint: string;
}

/** What {@link ListedToolsHost.approve} did for each pick. */
export interface ListedToolsApproval {
  readonly approved: readonly string[];
  /** Waiting at another version than the one shown: nothing was approved for them. */
  readonly changed: readonly string[];
}

/** The listed tools of the open workspace's connectors. The app provides it. */
export interface ListedToolsHost {
  /** Reads the connector's tools again from its server. */
  review(connectorId: string): Promise<ListedToolsSnapshot>;
  /** Approves each pick at the version given, as `halonic tools approve` does. A pick that waits at another version is returned in `changed`. */
  approve(connectorId: string, picks: readonly ListedToolPick[]): Promise<ListedToolsApproval>;
  /** Removes the approval of one tool: it is off until approved again. */
  removeApproval(connectorId: string, toolName: string): Promise<void>;
  /** Calls `listener` whenever a connector's tools may have changed. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void;
}

/** The open workspace's listed tools. The app provides it for each open workspace. */
export const ListedToolsHostService: ServiceKey<ListedToolsHost> =
  serviceKey<ListedToolsHost>("library.listed-tools");
