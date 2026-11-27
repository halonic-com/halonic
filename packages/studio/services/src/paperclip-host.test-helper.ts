/**
 * A stand-in agent host and Paperclip for the stepper's sign-in tests: the
 * invented `acme` Paperclip on `paperclip.acme.example`, its sign-in routes
 * and a keychain in memory. Its poll plays the Studio shell's part too: on
 * approval it writes the key to the keychain and confirms it, and answers the
 * page without the key (HAL-20278). The keychain and the keys the host holds
 * are kept apart, as the shell's and the host's are, so an entry the host
 * doesn't hold can be set up. Keys are made up and never real.
 */
import {
  AgentHostError,
  type PaperclipConnectionRef,
  type PaperclipConnectionRow,
  type PaperclipSignInStart,
  type PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import type { SignInConnection } from "@halonicjs/ports";
import { HostAgentConnections } from "./host-agent-connections.ts";
import { HostServiceSignIn } from "./host-service-sign-in.ts";

/** The shell's keychain token of a connection's key (`SecretName::paperclip_key`). */
function paperclipKeyTokenName(connection: string): string {
  return `paperclip-${connection}`;
}

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
  /** Connections whose key the keychain keeps and the host holds, and Paperclip takes. */
  keys?: readonly string[];
  /** Connections whose keychain entry was signed in from another workspace; the host holds none. */
  shellOnly?: readonly string[];
  /** Connections whose kept and held key Paperclip no longer takes: their rows say `signed-out`. */
  signedOut?: readonly string[];
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
  /**
   * How Disconnect goes: Paperclip revokes the key, can't, the host can't be asked, or the host
   * revoked it and the shell's keychain refused the delete.
   */
  disconnectGoes: "revoked" | "not-revoked" | "fails" | "keychain" = "revoked";
  /** Whether the connection rows say whom they are signed in as. */
  showsUserName = true;
  /** Called after each keychain write, so a test can close the stepper right then. */
  onKeyWritten: () => void = () => {};
  /** Called once the host has the shell's confirm, before the sign-in answers. */
  onConfirmed: () => void = () => {};
  /** When set, the shell can't say whether it keeps a key. */
  keyKeptFails = false;
  /** How many Disconnects the host was asked for. */
  disconnects = 0;
  readonly #setup: StandInSetup;
  readonly #challenges: Challenge[] = [];
  /** The key the host holds for each connection. */
  readonly #held = new Map<string, string>();
  /** Every key Paperclip still accepts. */
  readonly #working = new Set<string>();

  constructor(setup: StandInSetup) {
    this.#setup = setup;
    for (const name of setup.keys ?? []) this.#keep(name, "held", true);
    for (const name of setup.shellOnly ?? []) this.#keep(name, "shell", true);
    for (const name of setup.signedOut ?? []) this.#keep(name, "held", false);
  }

  /** Sets up a kept key for `name`: in the keychain, and held by the host too unless `shell`. */
  #keep(name: string, where: "held" | "shell", works: boolean): void {
    const key = `acme-made-up-key-${name}`;
    const workspace = where === "shell" ? "/work/other" : "/work/acme";
    this.keychain.set(paperclipKeyTokenName(name), this.#entryText(name, key, workspace));
    if (where === "held") this.#held.set(name, key);
    if (works) this.#working.add(key);
  }

  /** The stand-in board clicks Approve on the newest open sign-in. */
  approve(): void {
    for (const open of this.#pending()) {
      open.status = "approved";
      this.#working.add(open.key);
    }
  }

  /** The newest open sign-in ends without an approval: its time ran out, another company approved, or the board cancelled it. */
  end(status: "expired" | "wrong-company" | "cancelled"): void {
    for (const open of this.#pending()) open.status = status;
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
  serviceSignIn(report: (error: unknown) => void): HostServiceSignIn {
    const connections = new HostAgentConnections({
      signIn: this.signInRoutes(),
      host: { disconnect: (ref) => this.disconnect(ref) },
      // The host already holds every key it should, so the shell gives none back.
      restoreKeys: async () => 0,
      workspace: "/work/acme",
      wait: () => new Promise((resolve) => setTimeout(resolve, 0)),
      now: this.#setup.now,
      report,
    });
    // Studio asks the shell for a restore when the workspace opens.
    void connections.restore();
    const listed = () => this.signInRoutes().listed();
    const keyKept = async (connection: string) => {
      if (this.keyKeptFails) throw new Error("The shell couldn't ask the keychain.");
      return this.hasKey(connection);
    };
    return new HostServiceSignIn({ listed, connections, keyKept, now: this.#setup.now, report });
  }

  /** The host's `/v1/paperclip/sign-in/*` and connections routes. */
  signInRoutes() {
    return {
      listed: async () => ({ workspace: "/work/acme", connections: this.#rows() }),
      start: async (address: string, connection?: string) => this.#start(address, connection),
      poll: async (signInId: string) => this.#poll(signInId),
      cancel: async (signInId: string) => this.#cancel(signInId),
    };
  }

  /** The host's Disconnect: revokes the key at Paperclip and forgets it; the shell deletes the keychain entry, also when the host fails. */
  async disconnect(ref: PaperclipConnectionRef): Promise<{ revoked: boolean }> {
    this.disconnects += 1;
    if (this.disconnectGoes === "keychain") {
      this.#revokeHeld(ref.connection);
      throw new AgentHostError(0, "keychain", "The keychain refused the delete.");
    }
    this.keychain.delete(paperclipKeyTokenName(ref.connection));
    if (this.disconnectGoes === "fails") throw new Error("The agent host didn't answer.");
    if (this.disconnectGoes === "not-revoked") {
      this.#held.delete(ref.connection);
      return { revoked: false };
    }
    return { revoked: this.#revokeHeld(ref.connection) };
  }

  /** Revokes and forgets the key the host holds for `connection`; whether Paperclip took it. */
  #revokeHeld(connection: string): boolean {
    // Every Disconnect here follows a confirmed sign-in, so the host holds a key.
    const key = this.#held.get(connection) as string;
    this.#held.delete(connection);
    this.requests.push(revokeCurrent);
    return this.#working.delete(key);
  }

  #rows(): PaperclipConnectionRow[] {
    return Object.entries(this.#setup.connections).map(([name, file]) => {
      const key = this.#held.get(name);
      const signedIn = key !== undefined && this.#working.has(key);
      const state: PaperclipConnectionRow["state"] = signedIn
        ? { kind: "online", asOf: new Date(this.#setup.now()).toISOString() }
        : { kind: key === undefined ? "no-key" : "signed-out" };
      return {
        id: `paperclip:${name}`,
        name,
        label: "Paperclip · Acme",
        address: file.address,
        company: file.company,
        state,
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
    // The shell writes the key to the keychain, confirms it, and answers the page without it.
    const { connection, key } = challenge;
    this.keychain.set(paperclipKeyTokenName(connection), this.#entryText(connection, key));
    this.onKeyWritten();
    this.#confirm(signInId);
    // Only a listed connection file's sign-in is started.
    const { address, company } = this.#setup.connections[connection] as SignInConnection;
    return { status: "connected", connection, address, company };
  }

  /** The keychain entry the shell writes for `key`, signed in from `workspace`. */
  #entryText(connection: string, key: string, workspace = "/work/acme"): string {
    // Only a listed connection file's key is kept.
    const { address, company } = this.#setup.connections[connection] as SignInConnection;
    return JSON.stringify({ key, address, company, workspaces: [workspace] });
  }

  #confirm(signInId: string): void {
    const challenge = this.#find(signInId);
    challenge.status = "kept";
    this.#held.set(challenge.connection, challenge.key);
    this.onConfirmed();
  }

  #cancel(signInId: string): PaperclipSignInState {
    const challenge = this.#find(signInId);
    // After the approval and before the confirm, the host revokes the key and undoes the sign-in.
    // Once confirmed, the key is the connection's: only Disconnect revokes it.
    if (challenge.status === "approved" || challenge.status === "handed") {
      this.requests.push(revokeCurrent);
      this.#working.delete(challenge.key);
    }
    challenge.status = "cancelled";
    return { status: "cancelled" };
  }

  /** The sign-in with an ID this stand-in answered, `challenge-<n>`: the host asks only for those. */
  #find(signInId: string): Challenge {
    return this.#challenges[Number(signInId.slice("challenge-".length)) - 1] as Challenge;
  }

  #pending(): Challenge[] {
    return this.#challenges.filter((each) => each.status === "pending");
  }

  #lastKeyOf(connection: string): string | undefined {
    return this.#challenges.findLast((each) => each.connection === connection)?.key;
  }
}
