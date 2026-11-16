/**
 * One workflow the Inbox offers as a request: a workflow with a `start:` block.
 */
export interface RequestWorkflow {
  /** The app's own key for the workflow. The Inbox only hands it back to {@link InboxRequests.start}. */
  readonly key: string;
  /** The `start.label`: "Answer a customer's email". */
  readonly label: string;
  /** The workflow's description, shown as the Message placeholder. */
  readonly description?: string | undefined;
}

/**
 * The workflows the Inbox starts for you. The app provides it for each open workspace, from the
 * workflows' `start:` blocks and the engine.
 */
export interface InboxRequests {
  /** The workflows that offer a request, in the workspace's order. Rejects with the reason it couldn't read them. */
  offered(): Promise<readonly RequestWorkflow[]>;
  /**
   * Calls `listener` whenever the offered workflows may have changed. Returns a function that
   * stops the calls.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Starts the workflow with `message` (already trimmed) as its input, and returns the new run's
   * id. Rejects with the reason it didn't start, such as an account that is signed out.
   */
  start(key: string, message: string): Promise<{ readonly runId: string }>;
}
