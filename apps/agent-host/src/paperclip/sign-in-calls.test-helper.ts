import type {
  ChallengeRef,
  ChallengeRequest,
  ChallengeStatus,
  CreatedChallenge,
  KeyOwner,
  PaperclipKeyStore,
  SavedKey,
  SignInCalls,
  StoredPaperclipKey,
} from "./sign-in-calls.ts";
import { signInRequests } from "./sign-in-calls.ts";

/** A made-up key: Paperclip's real ones never appear in tests. */
export const fakeBoardKey = "acme-test-board-key";

/**
 * Paperclip's sign-in routes in memory, for tests. Each call records the
 * request from {@link signInRequests} it stands for, so a test can check
 * every request a sign-in sent.
 */
export class FakeSignInCalls implements SignInCalls {
  /** The requests sent, in order, such as `POST /api/cli-auth/challenges`. */
  readonly sent: string[] = [];
  readonly challenges: ChallengeRequest[] = [];
  readonly cancelled: ChallengeRef[] = [];
  readonly revoked: string[] = [];
  /** What the next polls answer; `pending` once it runs out. */
  statuses: ChallengeStatus[] = [];
  owner: KeyOwner = { userId: "user-ada", companyIds: ["acme"] };
  approvalPath = "/cli-auth/challenge-1?token=challenge-secret";
  /** What a cancel answers: `approved` when the board approved before it. */
  cancelAnswer: ChallengeStatus = "cancelled";
  /** When set, the next cancel throws it. */
  cancelFailsWith: Error | undefined;
  /** When set, the next poll waits until the test calls the function it is given. */
  holdNextPoll: ((answer: () => void) => void) | undefined;

  async createChallenge(request: ChallengeRequest): Promise<CreatedChallenge> {
    this.sent.push(signInRequests.createChallenge);
    this.challenges.push(request);
    return {
      id: "challenge-1",
      token: "challenge-secret",
      boardApiToken: fakeBoardKey,
      approvalPath: this.approvalPath,
    };
  }

  async pollChallenge(): Promise<ChallengeStatus> {
    this.sent.push(signInRequests.pollChallenge);
    const hold = this.holdNextPoll;
    if (hold !== undefined) {
      this.holdNextPoll = undefined;
      await new Promise<void>((resolve) => hold(resolve));
    }
    return this.statuses.shift() ?? "pending";
  }

  async cancelChallenge(challenge: ChallengeRef): Promise<ChallengeStatus> {
    this.sent.push(signInRequests.cancelChallenge);
    if (this.cancelFailsWith !== undefined) throw this.cancelFailsWith;
    this.cancelled.push(challenge);
    return this.cancelAnswer;
  }

  async readMe(): Promise<KeyOwner> {
    this.sent.push(signInRequests.readMe);
    return this.owner;
  }

  async revokeCurrent(key: string): Promise<void> {
    this.sent.push(signInRequests.revokeCurrent);
    this.revoked.push(key);
  }
}

/** A keychain store in memory, for tests; it can be made to fail. */
export class FakeKeyStore implements PaperclipKeyStore {
  readonly saved: StoredPaperclipKey[] = [];
  readonly dropped: { entry: StoredPaperclipKey; saved: SavedKey }[] = [];
  failWith: Error | undefined;
  /** When set, the next save waits until the test calls the function it is given. */
  holdNextSave: ((answer: () => void) => void) | undefined;

  async save(entry: StoredPaperclipKey): Promise<SavedKey> {
    if (this.failWith !== undefined) throw this.failWith;
    const hold = this.holdNextSave;
    if (hold !== undefined) {
      this.holdNextSave = undefined;
      await new Promise<void>((resolve) => hold(resolve));
    }
    this.saved.push(entry);
    return { createdFile: false };
  }

  async drop(entry: StoredPaperclipKey, saved: SavedKey): Promise<void> {
    this.dropped.push({ entry, saved });
  }
}
