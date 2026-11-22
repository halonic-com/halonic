import type { TrustAsks } from "./trust-asks.ts";

/**
 * A line under a trust check row: its label, its value and, for amber, its tone: `attention` is
 * amber, `warning` amber with the triangle.
 */
export type TrustLine = readonly [label: string, value: string, tone?: "attention" | "warning"];

/** One row of the trust check: a program, an agent, an address, or a change to one. */
export interface TrustRowView {
  /** The item's id, such as `mail-mcp`. */
  readonly id: string;
  /** What it is, in one line: the command, the program an agent runs in, the address. */
  readonly detail: string;
  /**
   * Label and value lines under the row, such as **Gets secrets** and its names. An empty label
   * continues the line above it; `attention` shows the value in amber, and `warning` in amber with
   * the triangle, as **Runs** is where an integration isn't in the sandbox.
   */
  readonly lines: readonly TrustLine[];
  /** The amber line for a program whose version isn't pinned. */
  readonly warning?: string | undefined;
  /** Words after the name, with the triangle, such as "not in the sandbox" (R12). */
  readonly flag?: string | undefined;
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
  /** The triangle before the heading, when a row in it carries a warning. */
  readonly mark?: "warning" | undefined;
}

/**
 * The person's yes to run integrations without the sandbox on this computer (R5), asked while
 * the check lists one and the host has no yes for this reason. **Trust** waits for the tick.
 */
export interface UnfencedYesAsk {
  /** The reason the yes is for, such as `windows`: a new reason clears the tick. */
  readonly reason: string;
  /** "I understand plugins and integrations run without the sandbox on this computer". */
  readonly checkbox: string;
  /** The reason in words, read once when it changes under a ticked box (R3's reason). */
  readonly reasonLine: string;
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
  /** The summary sentences, tools first. Empty only for a change that touches nothing to count. */
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
  /** The checkbox for integrations that run without the sandbox here, else absent. */
  readonly unfencedYes?: UnfencedYesAsk | undefined;
}

/**
 * How a person's trust was saved, or why not. `error` is the failure itself when one caused it,
 * so a screen words it as everywhere else (`engineReasonFor`) and offers **Copy details** for an
 * internal one (microcopy 22 F13); `reason` is then its raw message.
 */
export type TrustGrantResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly error?: unknown;
      /**
       * The sandbox status changed while the yes was saved, so nothing was saved: the check reads
       * it again and shows the reason that holds now, with the box to tick again. Nothing to say.
       */
      readonly checkAgain?: boolean;
    };

/**
 * What the workspace window needs of one workspace's trust: whether to show the badge, what the
 * check says, and a way to save a person's trust (`studio.workspace-trust-ui`).
 */
export interface WorkspaceTrustControl {
  /**
   * What the header badge shows: nothing while trusted or before the first answer, else
   * "Not trusted yet" (whose tooltip changes when the list of trusted workspaces can't be read),
   * "Changed since you trusted it", or "Couldn't load workspace settings" when the check failed.
   */
  readonly badge: "none" | "not-trusted" | "changed" | "list-unreadable" | "failed";
  /**
   * Where the workspace stands, for the workspace page: `trusted`, `not-trusted` (never, or after
   * **Remove trust**), `changed` since the person trusted it, `list-unreadable`, `failed` when
   * the check couldn't run (see {@link failure}), or `unknown` before the first answer.
   */
  readonly status: "unknown" | "trusted" | "not-trusted" | "changed" | "list-unreadable" | "failed";
  /**
   * Whether the workspace holds nothing to trust (HAL-10131): no connector, agent program,
   * plugin or real model, so only the test model can run. `status` stays `not-trusted`, but the
   * badge is `none` and `review()` is `undefined`. Absent counts as `false`.
   */
  readonly needsNoTrust?: boolean;
  /** Why the check couldn't run, while `status` is `failed`. */
  readonly failure: string | undefined;
  /** Runs the check again after it failed. Never rejects. */
  retry(): Promise<void>;
  /** When the person trusted it, as ISO text, while `status` is `trusted` or `changed`. */
  readonly trustedAt: string | undefined;
  /** The check to show now, `undefined` until the first answer or when the workspace is trusted. */
  review(): TrustReview | undefined;
  /**
   * Saves the person's trust in exactly the check with this fingerprint. With `allowUnfenced`, the
   * person ticked the check's `unfencedYes`: the yes is saved first, and trust only once it is.
   * Never rejects.
   */
  grant(fingerprint: string, allowUnfenced?: boolean): Promise<TrustGrantResult>;
  /** Forgets the person's trust, so the workspace asks again. Never rejects. */
  remove(): Promise<TrustGrantResult>;
  /**
   * Asks again whether the workspace's integrations run in the sandbox on this computer, so the
   * check's Runs rows say how they run now. The check calls it each time it opens. Absent where
   * nobody can say.
   */
  checkRuns?(): void;
  /** Calls `listener` after every change of the badge or the check; returns the way to stop. */
  subscribe(listener: () => void): () => void;
  /**
   * The starts that ask for the trust check after a refusal; the window's badge shows it for them.
   * Absent where nothing asks.
   */
  readonly asks?: TrustAsks | undefined;
}
