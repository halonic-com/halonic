/** What a sign-in starts for: a connection file of the served workspace, picked by address or name. */
export interface PaperclipSignInRequest {
  /** The address Studio's dialog names: scheme, host and port. */
  readonly address: string;
  /** The connection file's name, its file name without `.yaml`; else the file with this address. */
  readonly connection?: string | undefined;
}

/** How starting a sign-in went, as Studio's A4 dialog reads it. */
export type PaperclipSignInStart =
  | {
      readonly outcome: "started";
      readonly signInId: string;
      /** The phrase the approval page shows too. */
      readonly phrase: string;
      /** The approval page on the connection file's own address. */
      readonly approvalUrl: string;
      /** When the sign-in ends as `expired`, as an ISO time. */
      readonly expiresAt: string;
    }
  | { readonly outcome: "refused"; readonly reason: "address-not-allowed" | "unreachable" };

/**
 * Where a sign-in stands. Unlike the desktop host's answer, `connected` never
 * holds the key: the server keeps it in its own secret store.
 */
export type PaperclipSignInState =
  | { readonly status: "pending" }
  | {
      readonly status: "connected";
      readonly connection: string;
      readonly address: string;
      readonly company: string;
    }
  /** With `keyMayWork`, Paperclip couldn't say how the challenge ended and the key couldn't be revoked. */
  | { readonly status: "cancelled" | "expired"; readonly keyMayWork?: true }
  | { readonly status: "wrong-company" }
  | { readonly status: "unknown" };

/** What Disconnect did. The stored key and the cache are gone either way. */
export type PaperclipDisconnected =
  | { readonly outcome: "disconnected"; readonly revoked: boolean }
  /** No key was stored for that connection. */
  | { readonly outcome: "unknown" };

/**
 * The server's Paperclip sign-in and Disconnect (`server.paperclip-sign-in`).
 * The server makes every call to Paperclip; no method takes or answers a key.
 * Each may throw when Paperclip or the store fails: the route then answers
 * 502 and logs only the error's name.
 */
export interface PaperclipKeyPorts {
  start(request: PaperclipSignInRequest): Promise<PaperclipSignInStart>;
  poll(signInId: string): Promise<PaperclipSignInState>;
  cancel(signInId: string): Promise<PaperclipSignInState>;
  disconnect(connection: string): Promise<PaperclipDisconnected>;
}
