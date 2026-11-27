import type {
  ActionAccount,
  ServiceSignIn,
  SignInConnection,
  SignInConnectionRef,
  SignInEnd,
  SignInRevoke,
  SignInStart,
} from "@halonicjs/ports";

/** How long a sign-in lasts: Paperclip's challenge lifetime. */
const signInLimitMs = 10 * 60 * 1000;

/** What a {@link FakeServiceSignIn} signs in to: connection files, the keychain and the approver. */
export interface FakeServiceSignInOptions {
  /** The workspace's connection files, by name. */
  connections: Readonly<Record<string, SignInConnection>>;
  /** The connections that already have a key in the keychain. */
  keys?: readonly string[];
  /** Who approves a sign-in: the account's name. */
  approver: string;
  /** The injected clock. */
  now: () => Date;
}

interface OpenSignIn {
  connection: string;
  test: boolean;
  /** How the sign-in ended, once it has. */
  ended?: SignInEnd;
  /** Whether the key is in the keychain but the follow hasn't answered yet. */
  written: boolean;
  /** Answers the follow, once one is waiting. */
  answer?: (ended: SignInEnd) => void;
}

/**
 * A {@link ServiceSignIn} that runs in the process against a stand-in
 * Paperclip and keychain, so the stepper and its screen can be built and
 * tested before Studio's own is wired (requirement
 * `contracts.service-sign-in`). It holds no key: the keychain is the set of
 * connection names that have one.
 *
 * A test approves a sign-in with {@link FakeServiceSignIn.approve} or ends it
 * with {@link FakeServiceSignIn.expire}; `keychain` shows what is stored.
 * Until the follow has answered, a sign-in that is cancelled or expires
 * leaves no key, as every `ServiceSignIn` must.
 *
 * @example
 * const signIn = new FakeServiceSignIn({ connections, approver: "Acme Board", now });
 * const started = await signIn.start(ref, { test: true });
 */
export class FakeServiceSignIn implements ServiceSignIn {
  /** The connections with a key in the keychain. */
  readonly keychain: Set<string>;
  /** How many sign-ins Paperclip was asked to start. */
  started = 0;
  private readonly options: FakeServiceSignInOptions;
  private readonly open = new Map<string, OpenSignIn>();

  constructor(options: FakeServiceSignInOptions) {
    this.options = options;
    this.keychain = new Set(options.keys ?? []);
  }

  connection(ref: SignInConnectionRef): Promise<SignInConnection | undefined> {
    return Promise.resolve(this.fileOf(ref.connection));
  }

  start(ref: SignInConnectionRef, options: { test: boolean }): Promise<SignInStart> {
    const file = this.fileOf(ref.connection);
    if (file === undefined) return refused("no-connection");
    if (file.address !== `https://${ref.host}`) return refused("other-host");
    if (options.test && this.keychain.has(ref.connection)) return refused("already-signed-in");
    this.started += 1;
    const signInId = `sign-in-${this.started}`;
    this.open.set(signInId, { connection: ref.connection, test: options.test, written: false });
    const expiresAt = new Date(this.options.now().getTime() + signInLimitMs).toISOString();
    return Promise.resolve({
      outcome: "started",
      signInId,
      code: `acme-code-${this.started}`,
      approvalUrl: `${file.address}/cli-auth/challenge-${this.started}`,
      expiresAt,
    });
  }

  follow(signInId: string, signal: AbortSignal): Promise<SignInEnd> {
    const open = this.open.get(signInId);
    if (open === undefined) return Promise.resolve({ outcome: "cancelled" });
    if (open.ended !== undefined) return Promise.resolve(open.ended);
    const ended = new Promise<SignInEnd>((resolve) => {
      open.answer = resolve;
    });
    if (signal.aborted) this.end(open, { outcome: "cancelled" });
    signal.addEventListener("abort", () => this.end(open, { outcome: "cancelled" }), {
      once: true,
    });
    return ended;
  }

  cancel(signInId: string): Promise<void> {
    const open = this.open.get(signInId);
    if (open !== undefined) this.end(open, { outcome: "cancelled" });
    return Promise.resolve();
  }

  whoAmI(ref: SignInConnectionRef): Promise<ActionAccount | undefined> {
    if (!this.keychain.has(ref.connection)) return Promise.resolve(undefined);
    return Promise.resolve({ service: "paperclip", name: this.options.approver });
  }

  revokeTest(signInId: string): Promise<SignInRevoke> {
    const open = this.open.get(signInId);
    if (open === undefined || !open.test || open.ended?.outcome !== "signed-in") {
      return Promise.resolve({ outcome: "not-a-test" });
    }
    this.keychain.delete(open.connection);
    this.open.delete(signInId);
    return Promise.resolve({ outcome: "revoked" });
  }

  /**
   * The stand-in board approves the sign-in: its key goes to the keychain at
   * once, and the follow answers `signed-in` a moment later. An abort in
   * between still leaves no key.
   */
  approve(signInId: string): void {
    const open = this.open.get(signInId);
    if (open === undefined || open.ended !== undefined || open.written) return;
    this.keychain.add(open.connection);
    open.written = true;
    const account = { service: "paperclip", name: this.options.approver };
    queueMicrotask(() => this.end(open, { outcome: "signed-in", account }));
  }

  /** The sign-in reaches its time limit without an approval. */
  expire(signInId: string): void {
    const open = this.open.get(signInId);
    if (open !== undefined) this.end(open, { outcome: "expired" });
  }

  /** Ends a sign-in once. Cancelled after the keychain write, its key is removed again. */
  private end(open: OpenSignIn, ended: SignInEnd): void {
    if (open.ended !== undefined) return;
    if (ended.outcome !== "signed-in" && open.written) this.keychain.delete(open.connection);
    open.written = false;
    open.ended = ended;
    open.answer?.(ended);
  }

  private fileOf(name: string): SignInConnection | undefined {
    return Object.hasOwn(this.options.connections, name)
      ? this.options.connections[name]
      : undefined;
  }
}

const refused = (reason: Extract<SignInStart, { outcome: "refused" }>["reason"]) =>
  Promise.resolve<SignInStart>({ outcome: "refused", reason });
