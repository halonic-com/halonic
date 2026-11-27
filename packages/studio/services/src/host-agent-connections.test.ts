import type {
  PaperclipConnectionRef,
  PaperclipConnectionRow,
  PaperclipSignInStart,
  PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { HostAgentConnections, signInPollMs } from "./host-agent-connections.ts";

const address = "https://paperclip.acme.test";
const startedAt = Date.parse("2026-11-24T14:00:00.000Z");
const acmeRow: PaperclipConnectionRow = {
  id: "paperclip:acme",
  name: "acme",
  label: "Paperclip · Acme",
  address,
  company: "acme",
  state: { kind: "online", asOf: "2026-11-24T14:00:00.000Z" },
};
/** The row as Settings gets it: no file name or company. */
const { name: _name, company: _company, ...acmeListed } = acmeRow;
/** The approved poll as the shell passes it on: it kept the key, so the answer holds none. */
const connected: PaperclipSignInState = {
  status: "connected",
  connection: "acme",
  address,
  company: "acme",
};

/** The host's sign-in in memory: each poll takes the next state, or throws when it is an error. */
class FakeSignIn {
  rows: PaperclipConnectionRow[] = [];
  states: (PaperclipSignInState | Error)[] = [];
  starts: { address: string; connection: string | undefined; newConnection?: boolean }[] = [];
  cancels: string[] = [];
  startAnswer: PaperclipSignInStart = {
    outcome: "started",
    signInId: "sign-in-1",
    phrase: "amber falcon river seven",
    approvalUrl: `${address}/cli-auth/challenge-1`,
    expiresAt: new Date(startedAt + 600_000).toISOString(),
  };

  async listed() {
    return { workspace: "/work/acme", connections: this.rows };
  }
  async start(atAddress: string, connection?: string, options?: { newConnection?: boolean }) {
    this.starts.push({ address: atAddress, connection, ...options });
    return this.startAnswer;
  }
  async poll() {
    const next = this.states.shift() ?? { status: "pending" };
    if (next instanceof Error) throw next;
    if (next.status === "connected") this.rows = [acmeRow];
    return next;
  }
  async cancel(signInId: string) {
    this.cancels.push(signInId);
    return { status: "cancelled" } as const;
  }
}

function setUp(options: { revoked?: boolean } = {}) {
  const signIn = new FakeSignIn();
  /** The restores the page asked the shell for; a sign-in or Disconnect asks none. */
  const read: string[] = [];
  const disconnected: PaperclipConnectionRef[] = [];
  const reported: unknown[] = [];
  let now = startedAt;
  const connections = new HostAgentConnections({
    signIn,
    host: {
      disconnect: async (ref) => {
        disconnected.push(ref);
        return { revoked: options.revoked ?? true };
      },
    },
    restoreKeys: async (workspace) => {
      read.push(workspace);
      return 0;
    },
    workspace: "/work/acme",
    wait: async (ms) => {
      now += ms;
    },
    now: () => now,
    report: (error) => reported.push(error),
  });
  return {
    signIn,
    read,
    disconnected,
    reported,
    connections,
    advance: (ms: number) => (now += ms),
  };
}

async function resultOf(connections: HostAgentConnections, connection?: string) {
  const start = await connections.signIn(
    connection === undefined ? { address } : { address, connection },
  );
  if (start.outcome !== "started") throw new Error("expected a started sign-in");
  return { challenge: start.challenge, result: await start.challenge.result };
}

verifies("connections.connection-user", () => {
  it("hands features the user each connection is signed in as", async () => {
    const { signIn, connections } = setUp();
    const label = "Paperclip · Acme · Board Supervisor";
    signIn.rows = [{ ...acmeRow, label, userName: "Board Supervisor" }];
    expect(await connections.list()).toEqual([
      { ...acmeListed, provider: "paperclip", label, userName: "Board Supervisor" },
    ]);
  });
});

verifies("services.host-agent-connections", () => {
  describe("HostAgentConnections", () => {
    it("passes on the approved sign-in, which holds no key, and touches no keychain", async () => {
      const { signIn, read, reported, connections } = setUp();
      let heard = 0;
      connections.subscribe(() => heard++);
      signIn.states = [{ status: "pending" }, connected];
      const { result } = await resultOf(connections);
      expect(result).toEqual({
        outcome: "connected",
        connection: { ...acmeListed, provider: "paperclip" },
      });
      expect(signIn.cancels).toEqual([]);
      expect(read).toEqual([]);
      expect(reported).toEqual([]);
      expect(heard).toBe(1);
    });

    it("names the listed connection for Sign in again", async () => {
      const { signIn, connections } = setUp();
      signIn.rows = [{ ...acmeRow, state: { kind: "signed-out" } }];
      expect(await connections.list()).toEqual([
        { ...acmeListed, provider: "paperclip", state: { kind: "signed-out" } },
      ]);
      signIn.states = [connected];
      await resultOf(connections, "paperclip:acme");
      expect(signIn.starts).toEqual([{ address, connection: "acme" }]);
    });

    it("ends as key-not-saved when the shell couldn't keep the key", async () => {
      const { signIn, read, connections } = setUp();
      let heard = 0;
      connections.subscribe(() => heard++);
      signIn.states = [{ status: "key-not-saved" }];
      const { result } = await resultOf(connections);
      expect(result).toEqual({ outcome: "key-not-saved" });
      // The shell already cancelled the sign-in; the page sends nothing more.
      expect(signIn.cancels).toEqual([]);
      expect(read).toEqual([]);
      expect(heard).toBe(1);
    });

    it("still connects when the list fails after the key is kept", async () => {
      const { signIn, connections } = setUp();
      signIn.states = [connected];
      signIn.listed = async () => {
        throw new Error("The host can't be reached.");
      };
      const { result } = await resultOf(connections);
      expect(result).toMatchObject({ outcome: "connected", connection: { id: "acme", address } });
    });

    it("ends as the engine says: expired, refused, cancelled", async () => {
      const { signIn, connections } = setUp();
      signIn.states = [{ status: "expired" }];
      expect((await resultOf(connections)).result).toEqual({ outcome: "expired" });
      signIn.states = [{ status: "wrong-company" }];
      expect((await resultOf(connections)).result).toEqual({
        outcome: "refused",
        reason: "other-company",
      });
      signIn.states = [{ status: "unknown" }];
      expect((await resultOf(connections)).result).toEqual({ outcome: "cancelled" });
    });

    it("tries a failed poll again, and ends as expired once the 10 minutes have passed", async () => {
      const { signIn, connections, advance } = setUp();
      signIn.states = [new Error("The host can't be reached."), { status: "pending" }];
      const start = await connections.signIn({ address });
      if (start.outcome !== "started") throw new Error("expected a started sign-in");
      advance(600_000);
      signIn.states = [new Error("again"), new Error("again")];
      expect(await start.challenge.result).toEqual({ outcome: "expired" });
    });

    it("cancels through the host and ends as cancelled", async () => {
      const { signIn, connections } = setUp();
      const start = await connections.signIn({ address });
      if (start.outcome !== "started") throw new Error("expected a started sign-in");
      await start.challenge.cancel();
      expect(await start.challenge.result).toEqual({ outcome: "cancelled" });
      expect(signIn.cancels).toEqual(["sign-in-1"]);
    });

    it("answers a refused start as it came", async () => {
      const { signIn, connections } = setUp();
      signIn.startAnswer = { outcome: "refused", reason: "unreachable" };
      expect(await connections.signIn({ address })).toEqual({
        outcome: "refused",
        reason: "unreachable",
      });
    });

    it("disconnects a listed connection, and says how long a key it couldn't revoke stays valid", async () => {
      const { signIn, connections, disconnected, read } = setUp({ revoked: false });
      signIn.rows = [acmeRow];
      await connections.list();
      let heard = 0;
      const stop = connections.subscribe(() => heard++);
      expect(await connections.disconnect("paperclip:acme")).toEqual({
        revoked: false,
        validUntil: "2026-12-24T14:00:00.000Z",
      });
      // The shell deletes the keychain entry; the page only asks the host.
      expect(disconnected).toEqual([{ workspace: "/work/acme", connection: "acme" }]);
      expect(read).toEqual([]);
      expect(heard).toBe(1);
      stop();
      await expect(connections.disconnect("paperclip:globex")).rejects.toThrow();
    });

    it("says a revoked key is gone", async () => {
      const { signIn, connections } = setUp();
      signIn.rows = [acmeRow];
      await connections.list();
      expect(await connections.disconnect("paperclip:acme")).toEqual({ revoked: true });
    });

    it("waits between polls", () => {
      expect(signInPollMs).toBe(2000);
    });
  });
});

verifies("agent-host.paperclip-add-account", () => {
  describe("HostAgentConnections for another account", () => {
    it("asks the host for a new connection at the address", async () => {
      const { signIn, connections } = setUp();
      signIn.states = [connected];
      const start = await connections.signIn({ address, newConnection: true });
      if (start.outcome !== "started") throw new Error("expected a started sign-in");
      await start.challenge.result;
      expect(signIn.starts).toEqual([{ address, connection: undefined, newConnection: true }]);
    });
  });
});
