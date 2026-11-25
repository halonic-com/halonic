import { type SigningKey, signRequest } from "@halonicjs/host-signed-request";
import type { Clock, RandomBytes } from "@halonicjs/std";

/** The query a self-test request carries, inside the signed path, so Cloud doesn't count it as use. */
export const selfTestQuery = "self-test=1";

/** How long Cloud has to answer before the send counts as not delivered. */
export const cloudAnswerTimeoutMs = 10_000;

/**
 * What came of one send. Nothing is ever dropped: on `retry` and `key-refused` the caller keeps
 * the body and sends it again later. An answer names the key id at most, never the key or the
 * signature, so it is safe to log.
 */
export type CloudAnswer =
  | { readonly kind: "delivered" }
  | {
      readonly kind: "retry";
      /** `network`: no answer; `server`: 5xx or 429; `refused`: any other answer that isn't 2xx. */
      readonly reason: "network" | "server" | "refused";
      readonly status?: number;
      /** Why the request failed, for a `network` retry: the error's name and message. */
      readonly error?: string;
    }
  | {
      readonly kind: "key-refused";
      /** The key Cloud refused (revoked, retired or unknown). */
      readonly keyId: string;
    };

/** What a sender needs: where Cloud is, the product, the deployment key, the time and randomness. */
export interface CloudSenderOptions {
  /** Cloud's base URL, such as `https://cloud.example.com`. */
  readonly cloudUrl: string;
  /** The product the deployment key belongs to. */
  readonly product: string;
  readonly key: SigningKey;
  readonly clock: Clock;
  /** The nonce source: `crypto.getRandomValues` in the Worker, fixed bytes in tests. */
  readonly randomBytes: RandomBytes;
  readonly fetch: typeof fetch;
}

/** How one body is sent. */
export interface SendOptions {
  /** Marks the request as the deploy's self-test, so Cloud doesn't count it as the key's use. */
  readonly selfTest?: boolean;
}

/**
 * Sends signed requests from the deployment to Halonic Cloud: each body is signed with the
 * deployment key in the `deployment-to-cloud` direction and posted once. It never retries by
 * itself; the outbox that calls it decides when to try again.
 */
export class CloudSender {
  readonly #options: CloudSenderOptions;

  constructor(options: CloudSenderOptions) {
    this.#options = options;
  }

  /** The id of the key this sender signs with. */
  get keyId(): string {
    return this.#options.key.id;
  }

  /**
   * Posts `body` to `path` on Cloud, signed.
   *
   * @param path - a path on Cloud, such as `/v1/usage`
   * @param body - the exact bytes to send
   * @returns what came of it; never throws for a failed send
   * @throws if `path` points outside Cloud's origin, or if signing itself fails (a bad key is a
   *   setup error, not a failed send)
   */
  async send(path: string, body: Uint8Array, options: SendOptions = {}): Promise<CloudAnswer> {
    const url = new URL(path, this.#options.cloudUrl);
    // An absolute `path` would send a request signed with the deployment key to another host.
    if (url.origin !== new URL(this.#options.cloudUrl).origin) {
      throw new Error(`Cloud sender: ${path} is not on Cloud's origin.`);
    }
    if (options.selfTest === true) {
      const [name = "", value = ""] = selfTestQuery.split("=");
      url.searchParams.append(name, value);
    }
    const headers = await signRequest(
      {
        direction: "deployment-to-cloud",
        method: "POST",
        url: url.href,
        body,
        product: this.#options.product,
      },
      {
        key: this.#options.key,
        clock: this.#options.clock,
        randomBytes: this.#options.randomBytes,
      },
    );
    let response: Response;
    try {
      response = await this.#options.fetch(url.href, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: Uint8Array.from(body),
        signal: AbortSignal.timeout(cloudAnswerTimeoutMs),
      });
    } catch (error) {
      return { kind: "retry", reason: "network", error: describe(error) };
    }
    // The answer's body is never read: only the status says what happened. The status has
    // already arrived, so a body that fails to cancel doesn't change the answer.
    try {
      await response.body?.cancel();
    } catch (error) {
      console.warn(`Cloud sender: the answer's body did not cancel (${describe(error)}).`);
    }
    return this.#answerFor(response.status);
  }

  #answerFor(status: number): CloudAnswer {
    if (status >= 200 && status < 300) return { kind: "delivered" };
    // Cloud answers 401 for a key it no longer accepts; the caller resends with the current key.
    if (status === 401) return { kind: "key-refused", keyId: this.keyId };
    if (status === 429 || status >= 500) return { kind: "retry", reason: "server", status };
    return { kind: "retry", reason: "refused", status };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
