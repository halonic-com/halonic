import type {
  PaperclipConnectionRow,
  PaperclipKeyHandOver,
  PaperclipSignInState,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { HostAgentConnections } from "./host-agent-connections.ts";

// Made-up keys: no real one appears in tests.
const firstKey = "acme-test-board-key-1";
const secondKey = "acme-test-board-key-2";
const address = "https://paperclip.acme.test";
const company = "acme-company";

/** The OS keychain, which outlives every restart of Studio. */
type Keychain = Map<string, string>;

/**
 * One workspace as the agent host serves it, fresh after each restart: it
 * holds no key until Studio hands one over, as the real host keeps keys in
 * memory only. Studio may name the folder otherwise, such as through a link.
 */
class FakeHost {
  readonly handedOver: PaperclipKeyHandOver[] = [];
  /** The key the next sign-in's approved poll answers. */
  nextKey = firstKey;

  /** The workspace's real path, as the host resolves it. */
  readonly real: string;

  constructor(real: string) {
    this.real = real;
  }

  #row(): PaperclipConnectionRow {
    const state = this.handedOver.length === 0 ? { kind: "signed-out" as const } : online;
    return {
      id: "paperclip:halonic",
      name: "halonic",
      label: "Paperclip · Halonic",
      address,
      company,
      state,
    };
  }

  readonly signIn = {
    listed: async () => ({ workspace: this.real, connections: [this.#row()] }),
    start: async () => ({
      outcome: "started" as const,
      signInId: "sign-in-1",
      phrase: "amber falcon river seven",
      approvalUrl: `${address}/cli-auth/challenge-1`,
      expiresAt: "2026-11-25T23:00:00.000Z",
    }),
    poll: async (): Promise<PaperclipSignInState> => ({
      status: "connected",
      connection: "halonic",
      address,
      company,
      key: this.nextKey,
    }),
    confirm: async () => true,
    cancel: async () => ({ status: "cancelled" as const }),
  };

  readonly host = {
    handOver: async (entry: PaperclipKeyHandOver) => void this.handedOver.push(entry),
    disconnect: async () => ({ revoked: true }),
  };
}

const online = { kind: "online", asOf: "2026-11-25T22:00:00.000Z" } as const;

/** Opens `named` in Studio, as after a start: a new `HostAgentConnections` over the same keychain. */
function open(keychain: Keychain, host: FakeHost, named: string) {
  const reported: unknown[] = [];
  const connections = new HostAgentConnections({
    signIn: host.signIn,
    host: host.host,
    tokens: {
      get: async (name) => keychain.get(name) ?? null,
      set: async (name, value) => void keychain.set(name, value),
      remove: async (name) => void keychain.delete(name),
    },
    workspace: named,
    wait: async () => {},
    now: () => Date.parse("2026-11-25T22:00:00.000Z"),
    report: (error) => reported.push(error),
  });
  return { connections, reported };
}

/** Lists the connections, as Settings does, unless `listFirst` is false, then signs in to the Halonic one. */
async function signInThere(connections: HostAgentConnections, listFirst = true): Promise<void> {
  if (listFirst) await connections.list();
  const start = await connections.signIn({ address, connection: "paperclip:halonic" });
  if (start.outcome !== "started") throw new Error("expected a started sign-in");
  expect((await start.challenge.result).outcome).toBe("connected");
}

verifies("services.paperclip-restore", () => {
  describe("HostAgentConnections.restore, after Studio restarts", () => {
    it("gives the host back the key signed in with in this workspace, named through a link", async () => {
      const keychain: Keychain = new Map();
      await signInThere(open(keychain, new FakeHost("/real/acme"), "/links/acme").connections);

      const afterRestart = new FakeHost("/real/acme");
      const { connections, reported } = open(keychain, afterRestart, "/links/acme");
      let heard = 0;
      connections.subscribe(() => heard++);
      await connections.restore();

      expect(afterRestart.handedOver).toEqual([
        { workspace: "/links/acme", connection: "halonic", key: firstKey, address, company },
      ]);
      expect(heard).toBe(1);
      expect(reported).toEqual([]);
      expect((await connections.list())[0]?.state).toEqual(online);
    });

    it("records the real path also for a sign-in started without a list first", async () => {
      const keychain: Keychain = new Map();
      await signInThere(
        open(keychain, new FakeHost("/real/acme"), "/links/acme").connections,
        false,
      );

      expect(JSON.parse(keychain.get("paperclip-halonic") ?? "{}").workspaces).toEqual([
        "/real/acme",
      ]);
    });

    it("keeps one entry with the newest key when a second workspace signs in", async () => {
      const keychain: Keychain = new Map();
      await signInThere(open(keychain, new FakeHost("/real/acme"), "/real/acme").connections);
      const second = new FakeHost("/real/acme-docs");
      second.nextKey = secondKey;
      await signInThere(open(keychain, second, "/real/acme-docs").connections);

      expect([...keychain.keys()]).toEqual(["paperclip-halonic"]);
      expect(JSON.parse(keychain.get("paperclip-halonic") ?? "{}")).toEqual({
        key: secondKey,
        address,
        company,
        workspaces: ["/real/acme", "/real/acme-docs"],
      });
      for (const real of ["/real/acme", "/real/acme-docs"]) {
        const host = new FakeHost(real);
        await open(keychain, host, real).connections.restore();
        expect(host.handedOver.map((entry) => entry.key)).toEqual([secondKey]);
      }
    });

    it("gives nothing back to a clone the person never signed in from", async () => {
      const keychain: Keychain = new Map();
      await signInThere(open(keychain, new FakeHost("/real/acme"), "/real/acme").connections);

      const clone = new FakeHost("/real/acme-clone");
      await open(keychain, clone, "/real/acme-clone").connections.restore();
      expect(clone.handedOver).toEqual([]);
    });

    it("gives nothing back after Disconnect, which deletes the whole entry", async () => {
      const keychain: Keychain = new Map();
      await signInThere(open(keychain, new FakeHost("/real/acme"), "/real/acme").connections);
      const host = new FakeHost("/real/acme");
      const { connections } = open(keychain, host, "/real/acme");
      await connections.list();
      await connections.disconnect("paperclip:halonic");
      expect(keychain.size).toBe(0);

      const afterRestart = new FakeHost("/real/acme");
      await open(keychain, afterRestart, "/real/acme").connections.restore();
      expect(afterRestart.handedOver).toEqual([]);
    });
  });
});
