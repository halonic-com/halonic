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
 * It plays the Studio shell's part too (HAL-20278): an approved poll writes
 * the keychain entry, naming the workspace's real path after those an entry
 * for the same place named, and Disconnect deletes it.
 */
class FakeHost {
  readonly handedOver: PaperclipKeyHandOver[] = [];
  /** The key the next sign-in's approved poll answers. */
  nextKey = firstKey;

  /** The workspace's real path, as the host resolves it. */
  readonly real: string;
  readonly #keychain: Keychain;

  constructor(real: string, keychain: Keychain = new Map()) {
    this.real = real;
    this.#keychain = keychain;
  }

  /** What the shell does with the approved poll's key: the entry, then the answer without the key. */
  #keep(): PaperclipSignInState {
    const before = this.#keychain.get("paperclip-halonic");
    const earlier: string[] = before === undefined ? [] : JSON.parse(before).workspaces;
    const workspaces = [...earlier.filter((each) => each !== this.real), this.real];
    const entry = { key: this.nextKey, address, company, workspaces };
    this.#keychain.set("paperclip-halonic", JSON.stringify(entry));
    return { status: "connected", connection: "halonic", address, company };
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

  /** How many listings fail first, as while the host is still starting or doesn't serve the workspace yet. */
  listingsRefused = 0;

  readonly signIn = {
    listed: async () => {
      if (this.listingsRefused > 0) {
        this.listingsRefused--;
        throw new Error("The host serves no such workspace.");
      }
      return { workspace: this.real, connections: [this.#row()] };
    },
    start: async () => ({
      outcome: "started" as const,
      signInId: "sign-in-1",
      phrase: "amber falcon river seven",
      approvalUrl: `${address}/cli-auth/challenge-1`,
      expiresAt: "2026-11-25T23:00:00.000Z",
    }),
    poll: async (): Promise<PaperclipSignInState> => this.#keep(),
    cancel: async () => ({ status: "cancelled" as const }),
  };

  readonly host = {
    handOver: async (entry: PaperclipKeyHandOver) => void this.handedOver.push(entry),
    disconnect: async () => {
      this.#keychain.delete("paperclip-halonic");
      return { revoked: true };
    },
  };
}

const online = { kind: "online", asOf: "2026-11-25T22:00:00.000Z" } as const;

/** Opens `named` in Studio, as after a start: a new `HostAgentConnections` over the same keychain. */
function open(keychain: Keychain, host: FakeHost, named: string) {
  const reported: unknown[] = [];
  const connections = new HostAgentConnections({
    signIn: host.signIn,
    host: host.host,
    tokens: { get: async (name) => keychain.get(name) ?? null },
    workspace: named,
    wait: async () => {},
    now: () => Date.parse("2026-11-25T22:00:00.000Z"),
    report: (error) => reported.push(error),
  });
  return { connections, reported };
}

/** Lists the connections, as Settings does, then signs in to the Halonic one. */
async function signInThere(connections: HostAgentConnections): Promise<void> {
  await connections.list();
  const start = await connections.signIn({ address, connection: "paperclip:halonic" });
  if (start.outcome !== "started") throw new Error("expected a started sign-in");
  expect((await start.challenge.result).outcome).toBe("connected");
}

verifies("services.paperclip-restore", () => {
  describe("HostAgentConnections.restore, after Studio restarts", () => {
    it("gives the host back the key signed in with in this workspace, named through a link", async () => {
      const keychain: Keychain = new Map();
      await signInThere(
        open(keychain, new FakeHost("/real/acme", keychain), "/links/acme").connections,
      );

      const afterRestart = new FakeHost("/real/acme", keychain);
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

    it("keeps one entry with the newest key when a second workspace signs in", async () => {
      const keychain: Keychain = new Map();
      await signInThere(
        open(keychain, new FakeHost("/real/acme", keychain), "/real/acme").connections,
      );
      const second = new FakeHost("/real/acme-docs", keychain);
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
      await signInThere(
        open(keychain, new FakeHost("/real/acme", keychain), "/real/acme").connections,
      );

      const clone = new FakeHost("/real/acme-clone", keychain);
      await open(keychain, clone, "/real/acme-clone").connections.restore();
      expect(clone.handedOver).toEqual([]);
    });

    it("gives nothing back after Disconnect, which deletes the whole entry", async () => {
      const keychain: Keychain = new Map();
      await signInThere(
        open(keychain, new FakeHost("/real/acme", keychain), "/real/acme").connections,
      );
      const host = new FakeHost("/real/acme", keychain);
      const { connections } = open(keychain, host, "/real/acme");
      await connections.list();
      await connections.disconnect("paperclip:halonic");
      expect(keychain.size).toBe(0);

      const afterRestart = new FakeHost("/real/acme", keychain);
      await open(keychain, afterRestart, "/real/acme").connections.restore();
      expect(afterRestart.handedOver).toEqual([]);
    });

    it("tries again at the next list when the host couldn't list the workspace at the start", async () => {
      const keychain: Keychain = new Map();
      await signInThere(
        open(keychain, new FakeHost("/real/acme", keychain), "/real/acme").connections,
      );

      const afterRestart = new FakeHost("/real/acme", keychain);
      afterRestart.listingsRefused = 1;
      const { connections, reported } = open(keychain, afterRestart, "/real/acme");
      await connections.restore();
      expect(afterRestart.handedOver).toEqual([]);
      expect(reported).toHaveLength(1);

      const listed = await connections.list();
      expect(afterRestart.handedOver.map((entry) => entry.key)).toEqual([firstKey]);
      expect(listed[0]?.state).toEqual(online);
    });

    it("tries nothing again once a listing succeeded, even when nothing was handed over", async () => {
      // An empty keychain: the restore lists, finds no entry, and is done.
      const keychain: Keychain = new Map();
      let reads = 0;
      const get = keychain.get.bind(keychain);
      keychain.get = (name) => {
        reads++;
        return get(name);
      };
      const host = new FakeHost("/real/acme", keychain);
      const { connections } = open(keychain, host, "/real/acme");
      await connections.restore();
      expect(reads).toBe(1);

      await connections.list();
      await connections.list();
      expect(reads).toBe(1);
      expect(host.handedOver).toEqual([]);
    });

    it("hands nothing over in a workspace that never asked for a restore, such as an untrusted one", async () => {
      const keychain: Keychain = new Map();
      await signInThere(
        open(keychain, new FakeHost("/real/acme", keychain), "/real/acme").connections,
      );

      const afterRestart = new FakeHost("/real/acme", keychain);
      await open(keychain, afterRestart, "/real/acme").connections.list();
      expect(afterRestart.handedOver).toEqual([]);
    });
  });
});
