/** One row of the trust check: a program, an agent, an address, or a change to one. */
export interface TrustRowView {
  /** The item's id, such as `mail-mcp`. */
  readonly id: string;
  /** What it is, in one line: the command, the program an agent runs in, the address. */
  readonly detail: string;
  /** Label and value lines under the row, such as **Gets secrets** and its names. */
  readonly lines: readonly (readonly [label: string, value: string])[];
  /** The amber line for a program whose version isn't pinned. */
  readonly warning?: string | undefined;
  /** Set in "What changed". */
  readonly tag?: "New" | "Changed" | undefined;
}

/** A section of the check, such as **Programs (2)**. */
export interface TrustSectionView {
  readonly heading: string;
  /** The line under the heading, such as the one that says what an agent here is. */
  readonly intro?: string | undefined;
  readonly rows: readonly TrustRowView[];
  /** Whether the section opens by itself: when a program isn't pinned. */
  readonly open: boolean;
}

/**
 * What the trust check shows for one workspace (mockup-trust rev 2): the first-time check, or
 * "What changed" when the workspace has a record that no longer matches. Plain words, built by
 * the app from the engine's check, so this feature never reads the engine.
 */
export interface TrustReview {
  /** "Trust Acme?" or "Acme changed since you trusted it on 3 Nov". */
  readonly title: string;
  /** "Acme · ~/work/acme". */
  readonly source: string;
  /** Whether this is the "What changed" form. */
  readonly changed: boolean;
  /** The line for a list of trusted workspaces that couldn't be read, else absent. */
  readonly unreadable?: string | undefined;
  /** The summary sentences, tools first. Empty when there is nothing to count. */
  readonly summary: readonly string[];
  readonly sections: readonly TrustSectionView[];
  /** The closed "Unchanged (9 items)" row of "What changed", else absent. */
  readonly unchanged?: string | undefined;
  /** The fingerprint shown, which the grant must match: "hfp1:9f86…". */
  readonly fingerprint: string;
  /** The ids of programs that can download new code when they start; the person confirms them. */
  readonly unpinned: readonly string[];
  /** Why this can't be trusted at all, else absent. Then there is nothing to confirm. */
  readonly refused?: string | undefined;
  /** The fixed last line: what a trusted program can do. */
  readonly footnote: string;
}

/** How a person's trust was saved, or why not. */
export type TrustGrantResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * What the workspace window needs of one workspace's trust: whether to show the badge, what the
 * check says, and a way to save a person's trust (`studio.workspace-trust-ui`).
 */
export interface WorkspaceTrustControl {
  /**
   * What the header badge shows: nothing while trusted or before the first answer, else the
   * "Not trusted yet" badge, whose tooltip changes when the list of trusted workspaces can't be read.
   */
  readonly badge: "none" | "not-trusted" | "list-unreadable";
  /** The check to show now, `undefined` until the first answer or when the workspace is trusted. */
  review(): TrustReview | undefined;
  /** Saves the person's trust in exactly the check with this fingerprint. Never rejects. */
  grant(fingerprint: string): Promise<TrustGrantResult>;
  /** Calls `listener` after every change of the badge or the check; returns the way to stop. */
  subscribe(listener: () => void): () => void;
}
