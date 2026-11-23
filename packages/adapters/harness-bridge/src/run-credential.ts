// The per-run bridge credential for a program that runs away from the machine
// Halonic runs on, such as in a container on Cloudflare. It uses only
// Web-standard APIs (WebCrypto), so the Worker can import it without Node.

import {
  bytesToHex,
  type Clock,
  constantTimeEqual,
  encodeBase64url,
  encodeUtf8,
} from "@halonicjs/std";

/** 32 random bytes: as strong as a provider key, and short enough for a header. */
const runCredentialBytes = 32;

/**
 * What Halonic holds about the run a credential belongs to. The bridge takes
 * the run, and anything added here later, from this alone, never from the
 * program's request.
 */
export interface RunCredentialBinding {
  /** The run the credential was given to. */
  readonly runId: string;
  /** When the credential stops working, in milliseconds since 1970: the run's deadline. */
  readonly expiresAt: number;
}

/**
 * What a {@link RunCredentialStore} keeps for one run. Only the credential's
 * SHA-256 is kept, so a copy of the store can't call the bridge.
 */
export interface StoredRunCredential<Binding extends RunCredentialBinding> {
  /** The credential's SHA-256, in lowercase hex. */
  readonly digest: string;
  readonly binding: Binding;
  /** True once the run has ended. The record stays, so the run never gets a second credential. */
  readonly revoked: boolean;
}

/**
 * Where the credentials of runs are kept, one per run. The Worker keeps them
 * in the run's own Durable Object storage.
 */
export interface RunCredentialStore<Binding extends RunCredentialBinding> {
  /** The run's record, or `undefined` when the run never had a credential. */
  read(runId: string): Promise<StoredRunCredential<Binding> | undefined>;
  /**
   * Keeps the record only when its run has none yet, and says whether it did.
   * The look and the write are one atomic step (a Durable Object does them in
   * one `transaction`), so two calls for one run never both succeed.
   */
  create(record: StoredRunCredential<Binding>): Promise<boolean>;
  /** Replaces the run's existing record. */
  write(record: StoredRunCredential<Binding>): Promise<void>;
}

/** Why a request's credential was refused. Every reason gets the same reply. */
export type RunCredentialRefusal = "missing" | "unknown-run" | "revoked" | "expired" | "mismatch";

/** What {@link RunCredentials.check} found. */
export type RunCredentialCheck<Binding extends RunCredentialBinding> =
  | { readonly ok: true; readonly binding: Binding }
  | { readonly ok: false; readonly reason: RunCredentialRefusal };

/** What {@link RunCredentials} needs. */
export interface RunCredentialsOptions<Binding extends RunCredentialBinding> {
  store: RunCredentialStore<Binding>;
  clock: Clock;
  /** Returns a new array of cryptographically secure random bytes; WebCrypto by default. */
  randomBytes?: (byteCount: number) => Uint8Array;
}

/**
 * Gives each run one random bridge credential, checks the credential a
 * request sends, and revokes it when the run ends. A run gets a credential
 * once: a second request for the same run is refused, even after the first
 * credential was revoked, so a run id never gets a credential reused.
 */
export class RunCredentials<Binding extends RunCredentialBinding> {
  readonly #store: RunCredentialStore<Binding>;
  readonly #clock: Clock;
  readonly #randomBytes: (byteCount: number) => Uint8Array;

  constructor(options: RunCredentialsOptions<Binding>) {
    this.#store = options.store;
    this.#clock = options.clock;
    this.#randomBytes = options.randomBytes ?? webCryptoRandomBytes;
  }

  /**
   * A new credential for the run the binding names. Only its SHA-256 is
   * stored; the credential itself is returned once and never kept.
   *
   * @throws Error when the binding's deadline isn't a time still to come
   * @throws Error when the run already had a credential
   */
  async issue(binding: Binding): Promise<string> {
    // `NaN` would make the deadline check always pass, so the credential would never expire.
    if (!Number.isFinite(binding.expiresAt) || binding.expiresAt <= this.#clock.now().getTime()) {
      throw new Error(
        `Run ${binding.runId} needs a deadline still to come for a bridge credential.`,
      );
    }
    const credential = encodeBase64url(this.#randomBytes(runCredentialBytes));
    const record = { digest: await sha256Hex(credential), binding, revoked: false };
    if (!(await this.#store.create(record))) {
      throw new Error(
        `Run ${binding.runId} already had a bridge credential; a run gets one only once.`,
      );
    }
    return credential;
  }

  /**
   * Checks the credential a request for this run sent. It is looked up under
   * the run the request reached, never under one the request names, and the
   * digests are compared in constant time.
   */
  async check(runId: string, sent: string | null): Promise<RunCredentialCheck<Binding>> {
    if (sent === null || sent === "") return { ok: false, reason: "missing" };
    const record = await this.#store.read(runId);
    if (!record) return { ok: false, reason: "unknown-run" };
    // Hash before looking at the record's state, so a revoked, expired or wrong
    // credential costs the same. An unknown run is refused sooner, but the run
    // comes from routing, not from the caller.
    const sentDigest = await sha256Hex(sent);
    if (record.revoked) return { ok: false, reason: "revoked" };
    if (this.#clock.now().getTime() >= record.binding.expiresAt)
      return { ok: false, reason: "expired" };
    if (!constantTimeEqual(encodeUtf8(sentDigest), encodeUtf8(record.digest))) {
      return { ok: false, reason: "mismatch" };
    }
    return { ok: true, binding: record.binding };
  }

  /**
   * Revokes the run's credential when the run ends, however it ends. A run
   * with no credential, or one already revoked, is left as it is.
   *
   * For one run, inside the run's Durable Object, the caller issues before the
   * run starts and revokes after it ends. So a revoke that finds no record
   * leaves the run able to get a credential later, on purpose: that run never
   * started with one.
   */
  async revoke(runId: string): Promise<void> {
    const record = await this.#store.read(runId);
    if (!record || record.revoked) return;
    await this.#store.write({ ...record, revoked: true });
  }
}

function webCryptoRandomBytes(byteCount: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(byteCount));
}

async function sha256Hex(text: string): Promise<string> {
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(encodeUtf8(text)))),
  );
}
