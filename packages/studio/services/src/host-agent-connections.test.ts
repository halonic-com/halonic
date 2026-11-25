import type {
  PaperclipConnectionRef,
  PaperclipConnectionRow,
  PaperclipSignInStart,
  PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { HostAgentConnections, signInPollMs } from "./host-agent-connections.ts";

// A made-up key: no real one appears in tests.
const fakeKey = "acme-test-board-key";
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
const connected: PaperclipSignInState = {
  status: "connected",
  connection: "acme",
  address,
  company: "acme",
  key: fakeKey,
};

/** The host's sign-in in memory: each poll takes the next state, or throws when it is an error. */
class FakeSignIn {
  rows: PaperclipConnectionRow[] = [];
  states: (PaperclipSignInState | Error)[] = [];
  starts: { address: string; connection: string | undefined; newConnection?: boolean }[] = [];
  cancels: string[] = [];
  confirms: string[] = [];
  /** When set, a confirm or a cancel throws it. */
  failWith: Error | undefined;
  /** How many of the next confirms throw, as when their answer gets lost. */
  confirmsLost = 0;
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
  async confirm(signInId: string) {
    this.confirms.push(signInId);
    if (this.failWith !== undefined) throw this.failWith;
    if (this.confirmsLost > 0) {
      this.confirmsLost--;
      throw new Error("The answer got lost.");
    }
    return true;
  }
  async cancel(signInId: string) {
    this.cancels.push(signInId);
    if (this.failWith !== undefined) throw this.failWith;
    return { status: "cancelled" } as const;
  }
}

function setUp(options: { setFails?: boolean; revoked?: boolean } = {}) {
  const signIn = new FakeSignIn();
  const kept = new Map<string, string>();
  const disconnected: PaperclipConnectionRef[] = [];
  const reported: unknown[] = [];
  let now = startedAt;
  const connections = new HostAgentConnections({
    signIn,
    host: {
      handOver: async () => {},
      disconnect: async (ref) => {
        disconnected.push(ref);
        return { revoked: options.revoked ?? true };
      },
    },
    tokens: {
      get: async (name) => kept.get(name) ?? null,
      set: async (name, value) => {
        if (options.setFails) throw new Error("The keychain is locked.");
        kept.set(name, value);
      },
      remove: async (name) => void kept.delete(name),
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
    kept,
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
    it("writes the approved key to the keychain and passes on no key", async () => {
      const { signIn, kept, connections } = setUp();
      let heard = 0;
      connections.subscribe(() => heard++);
      signIn.states = [{ status: "pending" }, connected];
      const { result } = await resultOf(connections);
      expect(result).toEqual({
        outcome: "connected",
        connection: { ...acmeListed, provider: "paperclip" },
      });
      expect(JSON.stringify(result)).not.toContain(fakeKey);
      expect(JSON.parse(kept.get("paperclip-acme") ?? "{}")).toEqual({
        key: fakeKey,
        address,
        company: "acme",
        workspaces: ["/work/acme"],
      });
      expect(signIn.confirms).toEqual(["sign-in-1"]);
      expect(signIn.cancels).toEqual([]);
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

    it("cancels the sign-in when the keychain refuses the key, and keeps no copy", async () => {
      const { signIn, kept, disconnected, reported, connections } = setUp({ setFails: true });
      signIn.states = [connected];
      signIn.failWith = new Error("The host can't be reached.");
      const { result } = await resultOf(connections);
      expect(result).toEqual({ outcome: "key-not-saved" });
      expect(signIn.confirms).toEqual([]);
      expect(signIn.cancels).toEqual(["sign-in-1"]);
      expect(disconnected).toEqual([]);
      expect(kept.size).toBe(0);
      expect(reported).toHaveLength(2);
    });

    it("removes the written key and cancels when the host doesn't take the confirm", async () => {
      const { signIn, kept, reported, connections } = setUp();
      signIn.states = [connected];
      signIn.failWith = new Error("The host can't be reached.");
      const { result } = await resultOf(connections);
      expect(result).toEqual({ outcome: "key-not-saved" });
      expect(signIn.confirms).toEqual(["sign-in-1", "sign-in-1"]);
      expect(signIn.cancels).toEqual(["sign-in-1"]);
      expect(kept.size).toBe(0);
      expect(reported).toHaveLength(3);
    });

    it("puts the old key back when Sign in again fails at the confirm", async () => {
      const { signIn, kept, connections } = setUp();
      kept.set("paperclip-acme", "old-entry");
      signIn.states = [connected];
      signIn.failWith = new Error("The host can't be reached.");
      const { result } = await resultOf(connections);
      expect(result).toEqual({ outcome: "key-not-saved" });
      expect(kept.get("paperclip-acme")).toBe("old-entry");
      expect(signIn.cancels).toEqual(["sign-in-1"]);
    });

    it("keeps the old key when Sign in again fails at the keychain write", async () => {
      const { signIn, kept, connections } = setUp({ setFails: true });
      kept.set("paperclip-acme", "old-entry");
      signIn.states = [connected];
      const { result } = await resultOf(connections);
      expect(result).toEqual({ outcome: "key-not-saved" });
      expect(kept.get("paperclip-acme")).toBe("old-entry");
      expect(signIn.confirms).toEqual([]);
      expect(signIn.cancels).toEqual(["sign-in-1"]);
    });

    it("sends a confirm whose answer got lost once more, and connects when the host has the key", async () => {
      const { signIn, kept, reported, connections } = setUp();
      signIn.states = [connected];
      signIn.confirmsLost = 1;
      const { result } = await resultOf(connections);
      expect(result).toMatchObject({ outcome: "connected" });
      expect(signIn.confirms).toEqual(["sign-in-1", "sign-in-1"]);
      expect(signIn.cancels).toEqual([]);
      expect(kept.has("paperclip-acme")).toBe(true);
      expect(reported).toHaveLength(1);
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
      const { signIn, connections, kept } = setUp({ revoked: false });
      signIn.rows = [acmeRow];
      await connections.list();
      kept.set("paperclip-acme", "entry");
      let heard = 0;
      const stop = connections.subscribe(() => heard++);
      expect(await connections.disconnect("paperclip:acme")).toEqual({
        revoked: false,
        validUntil: "2026-12-24T14:00:00.000Z",
      });
      expect(kept.size).toBe(0);
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
