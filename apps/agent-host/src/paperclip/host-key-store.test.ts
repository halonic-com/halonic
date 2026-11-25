import type { PaperclipConnection } from "@halonicjs/format";
import { PaperclipKeys } from "@halonicjs/host-agent-messaging-hub";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { HostKeyStore, newConnectionLabel, newConnectionName } from "./host-key-store.ts";
import { fakeBoardKey } from "./sign-in-calls.test-helper.ts";
import type { StoredPaperclipKey } from "./sign-in-calls.ts";

const address = "https://paperclip.acme.test";
const entry = {
  address,
  companyId: "acme",
  key: fakeBoardKey,
  workspace: "/work/acme",
  name: "acme",
};

function storeWith(file: PaperclipConnection | undefined) {
  const kept: StoredPaperclipKey[] = [];
  const written: PaperclipConnection[] = [];
  const forgot: string[] = [];
  const removed: string[] = [];
  const store = new HostKeyStore({
    keep: (stored) => void kept.push(stored),
    connect: async () => undefined,
    readConnection: async () => file,
    writeConnection: async (_workspace, _name, connection) => void written.push(connection),
    forget: async (_workspace, name) => void forgot.push(name),
    removeConnection: async (_workspace, name) => void removed.push(name),
  });
  return { store, kept, written, forgot, removed };
}

verifies("agent-host.paperclip-sign-in", () => {
  describe("HostKeyStore", () => {
    it("keeps the key for a file that has the same address and company, and writes nothing", async () => {
      const { store, kept, written } = storeWith({
        label: "Acme",
        address: `${address}/`,
        company: "acme",
      });
      expect(await store.save(entry)).toEqual({ createdFile: false });
      expect(kept).toEqual([entry]);
      expect(written).toEqual([]);
    });

    it("undoes a save: forgets the key, and removes only a file it wrote", async () => {
      const { store, forgot, removed } = storeWith(undefined);
      const saved = await store.save(entry);
      expect(saved).toEqual({ createdFile: true });
      await store.drop(entry, saved);
      expect(forgot).toEqual(["acme"]);
      expect(removed).toEqual(["acme"]);
      await store.drop(entry, { createdFile: false });
      expect(removed).toEqual(["acme"]);
    });

    it("puts back the key a connection held before when its Sign in again is undone", async () => {
      const keys = new PaperclipKeys();
      const binding = { workspace: "/work/acme", connection: "acme" };
      const keyNow = () =>
        keys.callWith(binding, { address, company: "acme" }, async ({ key }) => key);
      keys.replace(binding, { key: "acme-test-old-key", address, company: "acme" });
      const forgot: string[] = [];
      const store = new HostKeyStore({
        keep: (stored) =>
          keys.replace(binding, { key: stored.key, address: stored.address, company: "acme" }),
        connect: async () => undefined,
        readConnection: async () => ({ label: "Acme", address, company: "acme" }),
        writeConnection: async () => undefined,
        forget: async (_workspace, name) => void forgot.push(name),
        removeConnection: async () => undefined,
      });
      const saved = await store.save(entry);
      expect(await keyNow()).toBe(fakeBoardKey);
      await store.drop(entry, saved);
      expect(await keyNow()).toBe("acme-test-old-key");
      expect(forgot).toEqual([]);
    });

    it("keeps no key when the file changed to another company during the sign-in", async () => {
      const { store, kept } = storeWith({ label: "Acme", address, company: "globex" });
      await expect(store.save(entry)).rejects.toThrow("changed");
      expect(kept).toEqual([]);
    });
  });

  describe("a new connection's name and label", () => {
    it("come from the host, with a number when the name is taken", () => {
      expect(newConnectionLabel("https://paperclip.halonic.com")).toBe("Halonic");
      expect(newConnectionName("https://paperclip.halonic.com", [])).toBe("halonic");
      expect(newConnectionName("https://paperclip.halonic.com", ["halonic", "halonic-2"])).toBe(
        "halonic-3",
      );
    });

    it("use the whole host when it has no dot, or is an IP address", () => {
      expect(newConnectionLabel("http://localhost:3100")).toBe("Localhost");
      expect(newConnectionName("http://127.0.0.1:3100", [])).toBe("127-0-0-1");
      expect(newConnectionName("http://[::1]:3100", [])).toBe("1");
    });
  });
});
