/**
 * The shell's `action_*` commands (`apps/studio/src-tauri/src/actions.rs`
 * and, for the records, `action_records.rs`).
 * Only the app's own windows are granted them; the Studio the computer
 * serves gets none. Each takes a step by its name and its placeholders,
 * never an address, and none takes or gives a token.
 */
export const actionCommands = {
  /** `{ request }` → the send's result. */
  send: "action_send",
  /** `{ request }` → the open's result. */
  openGuided: "action_open_guided",
  /** `{ url }` → the open's result: a `browser` block's page, if the route list's web origins allow it. */
  openPage: "action_open_page",
  /** `{ service, code }` → the sign-in's result; the device code comes over the channel `code`. */
  signIn: "action_sign_in",
  /** No arguments → nothing; cancels the sign-in this page started. */
  cancelSignIn: "action_sign_in_cancel",
  /** `{ service }` → nothing; also when nobody is signed in. */
  signOut: "action_sign_out",
  /** `{ service }` → the account, or `null`. */
  account: "action_account",
  /** `{ event }` → nothing; refuses an event the allow-list refuses as `refused-event`, writing nothing. */
  recordAppend: "action_record_append",
  /** `{ request }` → the request's events, oldest first. */
  recordRead: "action_record_read",
} as const;

/** A channel the page opened for a command to send messages back over. */
export interface ShellChannel {
  /** The value the command's channel argument takes. */
  readonly argument: string;
  /** Stops reading: the shell's later messages are dropped. Closing twice is fine. */
  close(): void;
}

/**
 * The part of Tauri's IPC this adapter needs: `invoke`, and a channel for
 * the device code a sign-in sends back. Passed in, so tests use a fake shell
 * and the adapter needs no Tauri library; `studio/services` gives it the
 * page's own.
 */
export interface ActionShell {
  /** Calls a shell command with its arguments; rejects with the shell's refusal, or with the IPC's own failure. */
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Opens a channel whose messages, in the order sent, go to `onMessage`. */
  openChannel(onMessage: (message: unknown) => void): ShellChannel;
}

/**
 * The code the user types on the service's sign-in page, which the shell
 * has opened in their browser. Not a secret on its own: it only works for
 * the person signed in on that page, and only until it expires.
 */
export interface ActionUserCode {
  code: string;
  /** The page where the user types it, fixed by the shell. */
  page: string;
  /** Seconds until the code stops working. */
  expiresIn: number;
}
