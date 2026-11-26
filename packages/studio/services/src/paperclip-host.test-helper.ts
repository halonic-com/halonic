/**
 * A stand-in agent host and Paperclip for the stepper's sign-in tests: the
 * invented `acme` Paperclip on `paperclip.acme.example`, its sign-in routes
 * and a keychain in memory. Keys are made up and never real.
 */
import type {
  PaperclipConnectionRef,
  PaperclipConnectionRow,
  PaperclipSignInStart,
  PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import type { SignInConnection } from "@halonicjs/ports";
import { HostAgentConnections } from "./host-agent-connections.ts";
import { HostServiceSignIn } from "./host-service-sign-in.ts";
import { paperclipKeyTokenName } from "./paperclip-key.ts";

/** The request `/api/cli-auth/revoke-current`, as the stand-in Paperclip logs it. */
export const revokeCurrent = "POST /api/cli-auth/revoke-current";

interface Challenge {
  id: string;
  connection: string;
  status: "pending" | "approved" | "handed" | "kept" | "cancelled" | "expired" | "wrong-company";
  key: string;
}

/** What the stand-in serves: connection files, keys already kept and who approves. */
export interface StandInSetup {
  connections: Readonly<Record<string, SignInConnection>>;
  keys?: readonly string[];
  approver: string;
  now: () => number;
}

/** The agent host's sign-in routes and Disconnect, over a Paperclip that knows which keys work. */
export class StandInPaperclipHost {
  /** The Paperclip requests the host sent that a test checks for. */
  readonly requests: string[] = [];
  /** The keychain, by token name. */
  readonly keychain = new Map<string, string>();
  /** When set, the next start answers this approval page instead of one on the file's address. */
  approvalUrl: string | undefined;
  /** When set, the next start answers this expiry instead of 10 minutes on. */
  expiresAt: string | undefined;
  /** When set, the next start is refused for this reason. */
  refuseStart: "address-not-allowed" | "unreachable" | "too-many-sign-ins" | undefined;
  /** How Disconnect goes: Paperclip revokes the key, can't, or the host can't be asked. */
  disconnectGoes: "revoked" | "not-revoked" | "fails" = "revoked";
  /** Whether the connection rows say whom they are signed in as. */
  showsUserName = true;
  /** Called after each keychain write, so a test can close the stepper right then. */
  onKeyWritten: () => void = () => {};
  /** Called once the host has the keychain write's confirm, before the sign-in answers. */
  onConfirmed: () => void = () => {};
  readonly #setup: StandInSetup;
  readonly #challenges: Challenge[] = [];
  /** The key the host holds for each connection. */
  readonly #held = new Map<string, string>();
  /** Every key Paperclip still accepts. */
  readonly #working = new Set<string>();

  constructor(setup: StandInSetup) {
    this.#setup = setup;
    for (const name of setup.keys ?? []) {
      const key = `acme-made-up-key-${name}`;
      this.keychain.set(paperclipKeyTokenName(name), key);
      this.#held.set(name, key);
      this.#working.add(key);
    }
  }

  /** The stand-in board clicks Approve on the newest open sign-in. */
  approve(): void {
    const open = this.#challenges.findLast((each) => each.status === "pending");
    if (open === undefined) return;
    open.status = "approved";
    this.#working.add(open.key);
  }

  /** The newest open sign-in ends without an approval: its time ran out, another company approved, or the board cancelled it. */
  end(status: "expired" | "wrong-company" | "cancelled"): void {
    const open = this.#challenges.findLast((each) => each.status === "pending");
    if (open !== undefined) open.status = status;
  }

  /** What `GET /api/cli-auth/me` answers with the connection's key, as an HTTP status. */
  me(connection: string): 200 | 401 {
    const key = this.#held.get(connection) ?? this.#lastKeyOf(connection);
    return key !== undefined && this.#working.has(key) ? 200 : 401;
  }

  /** Whether the keychain holds a key for the connection. */
  hasKey(connection: string): boolean {
    return this.keychain.has(paperclipKeyTokenName(connection));
  }

  /** Studio's own `ServiceSignIn`, over this stand-in. */
  serviceSignIn(report: (error: unknown) => void = rethrowLater): HostServiceSignIn {
    const tokens = {
      get: async (name: string) => this.keychain.get(name) ?? null,
      set: async (name: string, value: string) => {
        this.keychain.set(name, value);
        this.onKeyWritten();
      },
      remove: async (name: string) => void this.keychain.delete(name),
    };
    const connections = new HostAgentConnections({
      signIn: this.signInRoutes(),
      host: { handOver: async () => {}, disconnect: (ref) => this.disconnect(ref) },
      tokens,
      workspace: "/work/acme",
      wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      now: this.#setup.now,
      report,
    });
    const listed = () => this.signInRoutes().listed();
    return new HostServiceSignIn({ listed, connections, tokens, now: this.#setup.now, report });
  }

  /** The host's `/v1/paperclip/sign-in/*` and connections routes. */
  signInRoutes() {
    return {
      listed: async () => ({ workspace: "/work/acme", connections: this.#rows() }),
      start: async (address: string, connection?: string) => this.#start(address, connection),
      poll: async (signInId: string) => this.#poll(signInId),
      confirm: async (signInId: string) => this.#confirm(signInId),
      cancel: async (signInId: string) => this.#cancel(signInId),
    };
  }

  /** The host's Disconnect: revokes the key at Paperclip and forgets it. */
  async disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }> {
    if (this.disconnectGoes === "fails") throw new Error("The agent host didn't answer.");
    const key = this.#held.get(ref.connection);
    this.#held.delete(ref.connection);
    if (key === undefined || this.disconnectGoes === "not-revoked") return { revoked: false };
    this.requests.push(revokeCurrent);
    this.#working.delete(key);
    return { revoked: true };
  }

  #rows(): PaperclipConnectionRow[] {
    return Object.entries(this.#setup.connections).map(([name, file]) => {
      const key = this.#held.get(name);
      const signedIn = key !== undefined && this.#working.has(key);
      return {
        id: `paperclip:${name}`,
        name,
        label: "Paperclip · Acme",
        address: file.address,
        company: file.company,
        state: signedIn
          ? { kind: "online", asOf: new Date(this.#setup.now()).toISOString() }
          : { kind: "no-key" },
        ...(signedIn && this.showsUserName ? { userName: this.#setup.approver } : {}),
      };
    });
  }

  #start(address: string, connection = "acme"): PaperclipSignInStart {
    if (this.refuseStart !== undefined) return { outcome: "refused", reason: this.refuseStart };
    const id = `challenge-${this.#challenges.length + 1}`;
    this.requests.push("POST /api/cli-auth/challenges");
    this.#challenges.push({ id, connection, status: "pending", key: `acme-made-up-key-${id}` });
    const approvalUrl = this.approvalUrl ?? `${address}/cli-auth/${id}`;
    const expiresAt = this.expiresAt ?? new Date(this.#setup.now() + 600_000).toISOString();
    return { outcome: "started", signInId: id, phrase: `acme code ${id}`, approvalUrl, expiresAt };
  }

  #poll(signInId: string): PaperclipSignInState {
    const challenge = this.#find(signInId);
    const { status } = challenge;
    if (status === "cancelled" || status === "expired" || status === "wrong-company")
      return { status };
    if (status !== "approved") return { status: "pending" };
    challenge.status = "handed";
    const file = this.#setup.connections[challenge.connection];
    const { address = "", company = "" } = file ?? {};
    return {
      status: "connected",
      connection: challenge.connection,
      address,
      company,
      key: challenge.key,
    };
  }

  #confirm(signInId: string): boolean {
    const challenge = this.#find(signInId);
    if (challenge.status !== "handed") return false;
    challenge.status = "kept";
    this.#held.set(challenge.connection, challenge.key);
    this.onConfirmed();
    return true;
  }

  #cancel(signInId: string): PaperclipSignInState {
    const challenge = this.#find(signInId);
    // After the approval, the host revokes the key and undoes the sign-in.
    if (
      challenge.status === "approved" ||
      challenge.status === "handed" ||
      challenge.status === "kept"
    ) {
      this.requests.push(revokeCurrent);
      this.#working.delete(challenge.key);
      if (this.#held.get(challenge.connection) === challenge.key) {
        this.#held.delete(challenge.connection);
      }
    }
    challenge.status = "cancelled";
    return { status: "cancelled" };
  }

  #find(signInId: string): Challenge {
    const challenge = this.#challenges.find((each) => each.id === signInId);
    if (challenge === undefined) throw new Error(`No sign-in ${signInId}.`);
    return challenge;
  }

  #lastKeyOf(connection: string): string | undefined {
    return this.#challenges.findLast((each) => each.connection === connection)?.key;
  }
}

/** A failure a test didn't expect: thrown outside the test's own promise, so Vitest still sees it. */
function rethrowLater(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}
