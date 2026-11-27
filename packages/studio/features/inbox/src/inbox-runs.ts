import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
import type { RunProposalEntry } from "./proposal-items.ts";
import type { InboxWaitContext } from "./wait-context.ts";

/**
 * The runs the Inbox reads and answers. The app provides them for the open
 * workspace, from the run history (`RunHistory.listRuns`) and the run
 * executor.
 */
export interface InboxRuns {
  /** Every real run that waits now; test runs (Try it) may be left in, the Inbox skips them. */
  waiting(): Promise<readonly RunSummary[]>;
  /**
   * Calls `listener` whenever a run may have started or stopped waiting,
   * here or on another device. Returns a function that stops the calls.
   */
  subscribe(listener: () => void): () => void;
  /**
   * An agent's name as its file says; `undefined` when the workspace has no such agent or can't
   * be read, and the Inbox then shows the id.
   */
  agentName?(agentId: string): string | undefined;
  /** What the last list said about a waiting run, where the Studio has no Runs list (`studio.served-wait-context`). */
  waitContext?(runId: string): InboxWaitContext | undefined;
  /** Sends an answer to a run; see `RunExecutor.send`. */
  send: RunExecutor["send"];
  /**
   * The workspace's run proposals that aren't settled, each with its run's record, which says how
   * the run ended (HAL-10916). Without it the Inbox lists no proposals. `subscribe` also calls
   * when a proposal is made or decided.
   */
  proposals?(): Promise<readonly RunProposalEntry[]>;
  /**
   * The proposals settled in the last 30 days, each with its run's record, for the Done heading
   * (HAL-11945 Q10). Without it Done stays empty.
   */
  doneProposals?(): Promise<readonly RunProposalEntry[]>;
  /** An item's name as its file says; `undefined` when it can't be read, and the Inbox shows the id. */
  itemName?(itemId: string): string | undefined;
}
