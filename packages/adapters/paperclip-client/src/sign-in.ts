import { checkedOrigin } from "./address.ts";
import { isSafeSegment } from "./requests.ts";
import {
  type PaperclipSignInRequestName,
  paperclipSignInRequests,
  signInPath,
} from "./sign-in-requests.ts";
import { bodyOf, PaperclipClientError, PaperclipTransport } from "./transport.ts";

/** What a sign-in asks Paperclip for when it starts a challenge. */
export interface SignInChallengeRequest {
  /** The text the approval page shows: the phrase Studio shows too. */
  command: string;
  clientName: string;
  requestedAccess: "board";
  /** Only labels Paperclip's audit log; a new connection has no company yet. */
  requestedCompanyId?: string;
}

/** A challenge Paperclip made, with the key that works only once the board approves. */
export interface SignInChallenge {
  id: string;
  /** The challenge's own secret, sent with every poll and the cancel. */
  token: string;
  boardApiToken: string;
  approvalPath: string;
}

/** The challenge a poll or a cancel names. */
export interface SignInChallengeRef {
  id: string;
  token: string;
}

/** A challenge's state, as Paperclip reports it. */
export type SignInChallengeStatus = "pending" | "approved" | "cancelled" | "expired";

/** Who a key belongs to, from `/api/cli-auth/me`. */
export interface SignInKeyOwner {
  userId: string;
  companyIds: readonly string[];
}

/** Where a sign-in goes, and the `fetch` to use (the global one by default). */
export interface PaperclipSignInClientOptions {
  address: string;
  fetch?: typeof fetch;
}

/** The name Paperclip shows on the approval page and gives the key, followed by "(board)". */
export const signInClientName = "Halonic Studio";

const statuses: readonly string[] = ["pending", "approved", "cancelled", "expired"];

/**
 * Paperclip's CLI sign-in for one address, over plain `fetch`: the calls the
 * engine's sign-in flow makes (`SignInCalls` in the agent host). Starting,
 * polling and cancelling a challenge go only to {@link paperclipSignInRequests}
 * and carry no key; reading and revoking the key go through the messaging
 * list's `whoAmI` and `revokeKey`. No redirect is followed, and no error holds
 * a key, a challenge secret, a header or the body of a failed answer.
 */
export class PaperclipSignInClient {
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(options: PaperclipSignInClientOptions) {
    this.#origin = checkedOrigin(options.address);
    this.#fetch = options.fetch ?? fetch;
  }

  /** Starts a challenge; the answer already holds the key. */
  async createChallenge(request: SignInChallengeRequest): Promise<SignInChallenge> {
    const answer = await this.#send("createChallenge", undefined, { body: request });
    if (!answer.ok) {
      throw failed("createChallenge", answer.status);
    }
    return readChallenge(await this.#json("createChallenge", answer));
  }

  /** Reads a challenge's state. */
  async pollChallenge(challenge: SignInChallengeRef): Promise<SignInChallengeStatus> {
    const answer = await this.#send("pollChallenge", challenge.id, { token: challenge.token });
    if (!answer.ok) {
      throw failed("pollChallenge", answer.status);
    }
    return readStatus("pollChallenge", await this.#json("pollChallenge", answer));
  }

  /**
   * Cancels a challenge and answers the state it ended in. When Paperclip
   * refuses the cancel, as it may for a challenge that is no longer pending,
   * a poll tells which state it ended in: `approved` then tells the flow to
   * revoke the key, which works.
   */
  async cancelChallenge(challenge: SignInChallengeRef): Promise<SignInChallengeStatus> {
    const answer = await this.#send("cancelChallenge", challenge.id, {
      body: { token: challenge.token },
    });
    if (answer.ok) {
      return readStatus("cancelChallenge", await this.#json("cancelChallenge", answer));
    }
    await answer.body?.cancel();
    const endedAs = await this.pollChallenge(challenge);
    if (endedAs === "pending") {
      throw failed("cancelChallenge", answer.status);
    }
    return endedAs;
  }

  /** Reads who `key` belongs to. */
  async readMe(key: string): Promise<SignInKeyOwner> {
    const transport = this.#keyTransport(key);
    return readOwner(bodyOf("whoAmI", await transport.send("whoAmI")));
  }

  /** Revokes `key` itself. */
  async revokeCurrent(key: string): Promise<void> {
    const transport = this.#keyTransport(key);
    bodyOf("revokeKey", await transport.send("revokeKey"));
  }

  #keyTransport(key: string): PaperclipTransport {
    return new PaperclipTransport({ address: this.#origin, key, fetch: this.#fetch });
  }

  async #send(
    name: PaperclipSignInRequestName,
    challengeId: string | undefined,
    details: { body?: unknown; token?: string },
  ): Promise<Response> {
    const { method } = paperclipSignInRequests[name];
    const url = new URL(signInPath(name, challengeId), this.#origin);
    if (details.token !== undefined) {
      url.searchParams.set("token", details.token);
    }
    const headers: Record<string, string> = { accept: "application/json" };
    if (details.body !== undefined) {
      headers["content-type"] = "application/json";
    }
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body: details.body === undefined ? null : JSON.stringify(details.body),
        redirect: "manual",
      });
    } catch {
      // The platform's error can hold the URL, and with it the challenge secret.
      throw new PaperclipClientError(`Paperclip ${method} ${name} failed: offline.`, "offline");
    }
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new PaperclipClientError(
        `Paperclip answered ${method} ${name} with a redirect, which the client never follows.`,
        "redirect",
      );
    }
    return response;
  }

  async #json(name: PaperclipSignInRequestName, response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw badAnswer(name);
    }
  }
}

/**
 * The approval page on the connection's own address. Only a path under
 * `/cli-auth/` is taken from Paperclip's answer, so the page the board opens
 * is always on the address the board chose, even when Paperclip names another.
 *
 * @throws Error when the path is outside `/cli-auth/` or leads to another address
 */
export function approvalPageUrl(address: string, approvalPath: string): string {
  if (!approvalPath.startsWith("/cli-auth/") || approvalPath.includes("..")) {
    throw new Error("Paperclip answered with an approval path outside /cli-auth/");
  }
  const url = new URL(approvalPath, address);
  if (url.origin !== new URL(address).origin) {
    throw new Error("Paperclip answered with an approval page on another address");
  }
  return url.toString();
}

function readChallenge(body: unknown): SignInChallenge {
  const id = field(body, "id");
  const token = field(body, "token");
  const boardApiToken = field(body, "boardApiToken");
  const approvalPath = field(body, "approvalPath");
  if (id === undefined || !isSafeSegment(id) || token === undefined) {
    throw badAnswer("createChallenge");
  }
  // The key goes in a header later; one that can't would fail as if offline.
  if (boardApiToken === undefined || !/^[\x21-\x7e]+$/.test(boardApiToken)) {
    throw badAnswer("createChallenge");
  }
  if (approvalPath === undefined) {
    throw badAnswer("createChallenge");
  }
  return { id, token, boardApiToken, approvalPath };
}

function readStatus(name: PaperclipSignInRequestName, body: unknown): SignInChallengeStatus {
  const status = field(body, "status");
  if (status === undefined || !statuses.includes(status)) {
    throw badAnswer(name);
  }
  return status as SignInChallengeStatus;
}

function readOwner(body: unknown): SignInKeyOwner {
  const userId = field(body, "userId");
  const companyIds =
    typeof body === "object" && body !== null && "companyIds" in body ? body.companyIds : undefined;
  if (
    userId === undefined ||
    !Array.isArray(companyIds) ||
    !companyIds.every((companyId) => typeof companyId === "string")
  ) {
    throw new PaperclipClientError("Paperclip's answer to GET whoAmI isn't usable.", "bad-answer");
  }
  return { userId, companyIds };
}

/** A non-empty string field of `body`, or `undefined`. */
function field(body: unknown, name: string): string | undefined {
  if (typeof body !== "object" || body === null || !(name in body)) {
    return undefined;
  }
  const value: unknown = (body as Record<string, unknown>)[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function failed(name: PaperclipSignInRequestName, status: number): PaperclipClientError {
  const { method } = paperclipSignInRequests[name];
  const reason = status === 404 ? "not-found" : "refused";
  return new PaperclipClientError(`Paperclip ${method} ${name} failed: ${status}.`, reason);
}

function badAnswer(name: PaperclipSignInRequestName): PaperclipClientError {
  const { method } = paperclipSignInRequests[name];
  return new PaperclipClientError(
    `Paperclip's answer to ${method} ${name} isn't usable.`,
    "bad-answer",
  );
}
