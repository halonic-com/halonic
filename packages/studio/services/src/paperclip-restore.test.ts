import type {
  PaperclipConnectionList,
  PaperclipConnectionRow,
  PaperclipKeyHandOver,
} from "@halonicjs/adapter-agent-host-client";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { paperclipKeyEntryText } from "./paperclip-key.ts";
import { restorePaperclipKeys, sameWorkspace } from "./paperclip-restore.ts";

// A made-up key: no real one appears in tests.
const fakeKey = "acme-test-board-key";
const address = "https://paperclip.acme.test";
const company = "acme-company";
const realAcme = "/real/acme";
/** A made-up Windows folder, built from its parts so it reads as no one's real path. */
const windowsWork = ["C:", "Acme", "Work"].join("\\");
const halonicRow: PaperclipConnectionRow = {
  id: "paperclip:halonic",
  name: "halonic",
  label: "Paperclip · Halonic",
  address,
  company,
  state: { kind: "signed-out" },
};

/** A keychain in memory that counts its reads. */
function keychainWith(stored: Record<string, string>) {
  return { get: vi.fn(async (name: string) => stored[name] ?? null) };
}

/** Restores with the host listing `rows` for the workspace whose real path is `real`. */
async function restoreWith(options: {
  stored: Record<string, string>;
  rows?: readonly PaperclipConnectionRow[];
  real?: string;
  handOver?: (entry: PaperclipKeyHandOver) => Promise<void>;
  listed?: () => Promise<PaperclipConnectionList>;
}) {
  const tokens = keychainWith(options.stored);
  const handedOver: PaperclipKeyHandOver[] = [];
  const reported: unknown[] = [];
  const listed =
    options.listed ??
    (async () => ({
      workspace: options.real ?? realAcme,
      connections: options.rows ?? [halonicRow],
    }));
  const restored = await restorePaperclipKeys({
    listed,
    tokens,
    host: {
      handOver: async (entry) => {
        await options.handOver?.(entry);
        handedOver.push(entry);
      },
    },
    workspace: "/work/acme",
    report: (error) => reported.push(error),
  });
  return { restored, handedOver, reported, tokens };
}

const signedInHere = paperclipKeyEntryText({
  key: fakeKey,
  address,
  company,
  workspaces: [realAcme],
});

verifies("services.paperclip-restore", () => {
  describe("restorePaperclipKeys", () => {
    it("hands back the key the person signed in with in this workspace", async () => {
      const { restored, handedOver, reported } = await restoreWith({
        stored: { "paperclip-halonic": signedInHere },
      });

      expect(restored).toBe(1);
      expect(handedOver).toEqual([
        { workspace: "/work/acme", connection: "halonic", key: fakeKey, address, company },
      ]);
      expect(reported).toEqual([]);
    });

    it("hands nothing over in another workspace, such as a clone", async () => {
      const { handedOver } = await restoreWith({
        stored: { "paperclip-halonic": signedInHere },
        real: "/real/acme-clone",
      });
      expect(handedOver).toEqual([]);
    });

    it("finds this workspace on Windows also when its path is spelled with other casing", async () => {
      const windows = windowsWork;
      const entry = paperclipKeyEntryText({
        key: fakeKey,
        address,
        company,
        workspaces: [windows],
      });
      const { handedOver } = await restoreWith({
        stored: { "paperclip-halonic": entry },
        real: windows.toLowerCase(),
      });
      expect(handedOver).toHaveLength(1);
    });

    it("hands nothing over when the file names another address or company now", async () => {
      const stored = { "paperclip-halonic": signedInHere };
      const moved = { ...halonicRow, address: "https://paperclip.other.test" };
      const otherCompany = { ...halonicRow, company: "other-company" };
      expect((await restoreWith({ stored, rows: [moved] })).handedOver).toEqual([]);
      expect((await restoreWith({ stored, rows: [otherCompany] })).handedOver).toEqual([]);
    });

    it("compares only the address's scheme, host and port, as the host's key guard does", async () => {
      const withPath = { ...halonicRow, address: `${address}/` };
      const { handedOver } = await restoreWith({
        stored: { "paperclip-halonic": signedInHere },
        rows: [withPath],
      });
      expect(handedOver).toHaveLength(1);
    });

    it("hands nothing over with no entry, one it can't read, or one saved before it named workspaces", async () => {
      const old = JSON.stringify({ key: fakeKey, address, company });
      const notListed = JSON.stringify({
        key: fakeKey,
        address,
        company,
        workspaces: "/real/acme",
      });
      for (const stored of [
        {},
        { "paperclip-halonic": "not json" },
        { "paperclip-halonic": old },
      ]) {
        expect((await restoreWith({ stored })).handedOver).toEqual([]);
      }
      expect(
        (await restoreWith({ stored: { "paperclip-halonic": notListed } })).handedOver,
      ).toEqual([]);
    });

    it("leaves a connection that is already connected alone, without reading the keychain", async () => {
      const online = {
        ...halonicRow,
        state: { kind: "online", asOf: "2026-11-25T22:00:00Z" },
      } as const;
      const { handedOver, tokens } = await restoreWith({
        stored: { "paperclip-halonic": signedInHere },
        rows: [online],
      });
      expect(handedOver).toEqual([]);
      expect(tokens.get).not.toHaveBeenCalled();
    });

    it("reads the keychain once per connection and reports a failed hand-over, trying nothing again", async () => {
      const acmeRow = { ...halonicRow, id: "paperclip:acme", name: "acme" };
      const refused = new Error("The host refused the key.");
      const { restored, handedOver, reported, tokens } = await restoreWith({
        stored: { "paperclip-halonic": signedInHere, "paperclip-acme": signedInHere },
        rows: [halonicRow, acmeRow],
        handOver: async (entry) => {
          if (entry.connection === "halonic") throw refused;
        },
      });
      expect(restored).toBe(1);
      expect(handedOver.map((entry) => entry.connection)).toEqual(["acme"]);
      expect(reported).toEqual([refused]);
      expect(tokens.get.mock.calls).toEqual([["paperclip-halonic"], ["paperclip-acme"]]);
    });

    it("reports a list or keychain read that failed, and never throws", async () => {
      const unreachable = new Error("The agent host can't be reached.");
      const listFailed = await restoreWith({
        stored: {},
        listed: () => Promise.reject(unreachable),
      });
      expect(listFailed).toMatchObject({ restored: 0, reported: [unreachable] });

      const locked = new Error("The keychain is locked.");
      const tokens = { get: vi.fn(() => Promise.reject(locked)) };
      const reported: unknown[] = [];
      const restored = await restorePaperclipKeys({
        listed: async () => ({ workspace: realAcme, connections: [halonicRow] }),
        tokens,
        host: { handOver: vi.fn() },
        workspace: "/work/acme",
        report: (error) => reported.push(error),
      });
      expect(restored).toBe(0);
      expect(reported).toEqual([locked]);
    });
  });

  describe("sameWorkspace", () => {
    it("compares a Windows path without regard to case, as Windows does", () => {
      const share = ["", "", "acme-share", "Work"].join("\\");
      expect(sameWorkspace(windowsWork, windowsWork.toLowerCase())).toBe(true);
      expect(sameWorkspace(share, share.toUpperCase())).toBe(true);
      expect(sameWorkspace(windowsWork, `${windowsWork}-clone`)).toBe(false);
    });

    it("compares any other path exactly, as Linux and a case-sensitive Mac disk do", () => {
      expect(sameWorkspace("/real/acme/work", "/real/acme/work")).toBe(true);
      expect(sameWorkspace("/real/acme/work", "/real/acme/Work")).toBe(false);
    });
  });
});
