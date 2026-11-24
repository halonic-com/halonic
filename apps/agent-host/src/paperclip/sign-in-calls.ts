/**
 * The Paperclip requests a sign-in may send, and nothing else. HAL-17423
 * found that a board key can make more board keys that never expire, so no
 * request here makes, lists or deletes keys. The Paperclip client's
 * `PaperclipSignInClient` sends them: start, poll and cancel through its own
 * sign-in list, `me` and the revoke through the messaging list (HAL-17439).
 */
export const signInRequests = {
  createChallenge: "POST /api/cli-auth/challenges",
  pollChallenge: "GET /api/cli-auth/challenges/{id}",
  cancelChallenge: "POST /api/cli-auth/challenges/{id}/cancel",
  readMe: "GET /api/cli-auth/me",
  revokeCurrent: "POST /api/cli-auth/revoke-current",
} as const;

/** What a sign-in asks Paperclip for when it starts a challenge. */
export interface ChallengeRequest {
  /** The text the approval page shows: the phrase Studio shows too. */
  command: string;
  /** The name Paperclip gives the key, followed by "(board)". */
  clientName: string;
  requestedAccess: "board";
  /** Only labels Paperclip's audit log; it doesn't limit the key. */
  requestedCompanyId: string;
}

/**
 * A challenge Paperclip made. It already holds the key, which works only
 * once the board approves.
 */
export interface CreatedChallenge {
  id: string;
  /** The challenge's own secret, sent with every poll and the cancel. */
  token: string;
  /** The board key. It must never leave the engine's memory before approval. */
  boardApiToken: string;
  /** The approval page's path on the connection's address, such as `/cli-auth/<id>?token=…`. */
  approvalPath: string;
}

/** A challenge's state, as Paperclip reports it on a poll. */
export type ChallengeStatus = "pending" | "approved" | "cancelled" | "expired";

/** Who a key belongs to, from `/api/cli-auth/me`. */
export interface KeyOwner {
  userId: string;
  /** The companies the user belongs to. */
  companyIds: readonly string[];
}

/**
 * The Paperclip calls a sign-in makes, one per entry in
 * {@link signInRequests}. Each throws on a failed call, with no key, header
 * or answer body in its error.
 */
export interface SignInCalls {
  /** Starts a challenge. */
  createChallenge(request: ChallengeRequest): Promise<CreatedChallenge>;
  /** Reads a challenge's state. */
  pollChallenge(challenge: ChallengeRef): Promise<ChallengeStatus>;
  /**
   * Cancels a challenge, so a late approval makes no working key, and answers
   * the state it ended in (Paperclip's `status`). `approved` means the board
   * approved it first: the key works, and the caller must revoke it.
   */
  cancelChallenge(challenge: ChallengeRef): Promise<ChallengeStatus>;
  /** Reads who the key belongs to. */
  readMe(key: string): Promise<KeyOwner>;
  /** Revokes the key it is sent with. */
  revokeCurrent(key: string): Promise<void>;
}

/** The challenge a poll or a cancel names: its ID and its own secret. */
export interface ChallengeRef {
  id: string;
  token: string;
}

/** Where a signed-in key goes: the OS keychain, one entry per connection (A3d). */
export interface PaperclipKeyStore {
  /** Saves the key with the address and company it was made for. */
  save(entry: StoredPaperclipKey): Promise<void>;
}

/** A keychain entry: the key and the connection it was made for (`agent-host.paperclip-key`). */
export interface StoredPaperclipKey {
  /** The connection's address: scheme, host and port. */
  address: string;
  companyId: string;
  key: string;
}
