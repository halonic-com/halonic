/** A deployed Worker with one enabled webhook routine, and the secret that routine is signed with. */
export interface WebhookTarget {
  /** The Worker's address, such as `https://hlt-1-1.example.workers.dev`. */
  readonly baseUrl: string;
  /** The routine's address after `/api/webhooks/`: `<hub>/<routine>`. */
  readonly address: string;
  /** The routine's signing secret. Never printed. */
  readonly secret: string;
  /** Tests inject this; defaults to `fetch`. */
  readonly fetch?: typeof fetch;
  /** Tests inject this; defaults to the real clock, in milliseconds. */
  readonly now?: () => number;
}

/** What a delivery was answered with. */
export interface WebhookAnswer {
  readonly status: number;
  /** The `code` of the JSON error body, or `undefined` when the body isn't one. */
  readonly code: string | undefined;
  readonly text: string;
}

export interface DeliveryOptions {
  /** Defaults to the target's routine. */
  readonly address?: string;
  /** A fresh id by default; the same id twice is a replay. */
  readonly delivery?: string;
  readonly body?: string;
  /** Seconds since the epoch. Defaults to now. */
  readonly timestamp?: number;
  /** Replaces the correct signature (the hex digest). */
  readonly signature?: string;
}

/** The webhook secret's signature of one delivery: HMAC-SHA-256 of `<delivery>.<timestamp>.<body>`, in hex. */
export async function signDelivery(
  secret: string,
  delivery: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${delivery}.${timestamp}.${body}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/** Sends one signed (or deliberately mis-signed) delivery and returns what the Worker answered. */
export async function deliver(
  target: WebhookTarget,
  options: DeliveryOptions = {},
): Promise<WebhookAnswer> {
  const body = options.body ?? '{"id":"o-7"}';
  const delivery = options.delivery ?? `live-${crypto.randomUUID()}`;
  const timestamp = options.timestamp ?? Math.floor((target.now ?? Date.now)() / 1000);
  const signature =
    options.signature ?? (await signDelivery(target.secret, delivery, timestamp, body));
  const response = await (target.fetch ?? fetch)(
    new URL(`/api/webhooks/${options.address ?? target.address}`, target.baseUrl),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-halonic-delivery": delivery,
        "x-halonic-timestamp": String(timestamp),
        "x-halonic-signature": `sha256=${signature}`,
      },
      body,
    },
  );
  const text = await response.text();
  return { status: response.status, code: codeOf(text), text };
}

function codeOf(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    const code = (parsed as { code?: unknown } | null)?.code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/** The signature, replay and unknown-address checks are live. A check that fails throws an `Error` that names what differed. */
export const webhookChecks = {
  /** A wrong signature is refused with the one webhook answer. */
  async badSignature(target: WebhookTarget): Promise<void> {
    expectAnswer("a wrong signature", await deliver(target, { signature: "0".repeat(64) }), 401);
  },

  /** A correctly signed delivery whose timestamp is outside the window is refused like a bad signature. */
  async staleTimestamp(target: WebhookTarget): Promise<void> {
    const now = Math.floor((target.now ?? Date.now)() / 1000);
    expectAnswer("an old timestamp", await deliver(target, { timestamp: now - 3600 }), 401);
  },

  /**
   * An address with no routine, signed with the real secret, gets the same status and body as a bad
   * signature, so a caller learns nothing about which routines exist.
   */
  async unknownAddress(target: WebhookTarget): Promise<void> {
    const known = await deliver(target, { signature: "0".repeat(64) });
    const unknown = await deliver(target, { address: `${target.address}-no-such-routine` });
    expectAnswer("an unknown address", unknown, 401);
    if (unknown.text !== known.text) {
      throw new Error("An unknown address answered with a different body than a bad signature.");
    }
  },

  /**
   * Pending: a signed delivery must start a run and answer 202. The Worker starts no runs yet, so it
   * answers 501. This check passes while that is true and fails the day it changes, so the suite asks
   * to be updated rather than going quiet.
   */
  async runStartPending(target: WebhookTarget): Promise<void> {
    expectAnswer("a signed delivery (run start pending)", await deliver(target), 501);
  },

  /**
   * Pending: a delivery id that was accepted must be refused the second time with 409. While the Worker
   * answers 501 it keeps the id free for a retry (that is by design), so the same id answers 501 twice.
   * It fails the day the first answer is 202.
   */
  async replayPending(target: WebhookTarget): Promise<void> {
    const delivery = `live-${crypto.randomUUID()}`;
    expectAnswer("a first delivery (replay pending)", await deliver(target, { delivery }), 501);
    expectAnswer(
      "the same delivery again (replay pending)",
      await deliver(target, { delivery }),
      501,
    );
  },
};

function expectAnswer(what: string, answer: WebhookAnswer, status: number): void {
  if (answer.status !== status) {
    const code = answer.code === undefined ? "" : ` ${answer.code}`;
    throw new Error(`${what} was answered ${answer.status}${code}, expected ${status}.`);
  }
}
