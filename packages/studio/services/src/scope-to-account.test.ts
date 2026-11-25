import { HostSettings } from "@halonicjs/app";
import type { AgentMessaging, HostSettingsStore, HostSettingValue } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { HostActiveAccount } from "./active-account.ts";
import { scopeToAccount } from "./scope-to-account.ts";

/** A settings file two windows share: one value map, every store watching it. */
class SharedFile {
  values: Record<string, HostSettingValue> = {};
  readonly watchers = new Set<() => void>();
  store(): HostSettingsStore {
    return {
      read: async () => ({ ...this.values }),
      set: async (key, value) => {
        this.values[key] = value;
        for (const watcher of this.watchers) watcher();
      },
      remove: async (key) => {
        delete this.values[key];
      },
      watch: (listener) => {
        this.watchers.add(listener);
        return () => this.watchers.delete(listener);
      },
    };
  }
}

async function window(file: SharedFile): Promise<HostActiveAccount> {
  const account = new HostActiveAccount(file.store());
  await account.load();
  return account;
}

function twoAccounts() {
  const inner = new FakeAgentMessaging();
  const first = inner.addSource({ label: "Paperclip · Acme · Ada" });
  const second = inner.addSource({ label: "Paperclip · Acme · Bo" });
  inner.addConversation(inner.addAgent(first.id, { name: "Chief" }).id, { title: "Ada's" });
  inner.addConversation(inner.addAgent(second.id, { name: "Chief" }).id, { title: "Bo's" });
  return { inner, first, second };
}

const titles = async (messaging: FakeAgentMessaging | ReturnType<typeof scopeToAccount>) =>
  (await messaging.listConversations()).map((each) => each.title);

verifies("services.active-account", () => {
  describe("scopeToAccount", () => {
    it("shows the first account when none is picked", async () => {
      const { inner } = twoAccounts();
      const scoped = scopeToAccount(inner, await window(new SharedFile()));
      expect(await titles(scoped)).toEqual(["Ada's"]);
      expect(await scoped.listSources()).toHaveLength(1);
    });

    it("falls back to the first account when the picked one is gone", async () => {
      const { inner } = twoAccounts();
      const file = new SharedFile();
      const account = await window(file);
      await account.select("paperclip:gone");
      expect(await titles(scopeToAccount(inner, account))).toEqual(["Ada's"]);
    });

    it("follows a switch made in another window", async () => {
      const { inner, second } = twoAccounts();
      const file = new SharedFile();
      const main = await window(file);
      const focused = await window(file);
      const scopedFocused = scopeToAccount(inner, focused);
      expect(await titles(scopedFocused)).toEqual(["Ada's"]);

      await main.select(second.id);
      await Promise.resolve();
      await Promise.resolve();

      expect(await titles(scopedFocused)).toEqual(["Bo's"]);
    });

    it("drops the other account's changes", async () => {
      const { inner, first, second } = twoAccounts();
      const reader = scopeToAccount(inner, await window(new SharedFile()))
        .changes()
        [Symbol.asyncIterator]();
      const next = reader.next();
      inner.addAgent(second.id, { name: "Quiet" });
      inner.addAgent(first.id, { name: "Loud" });
      expect((await next).value).toBe(first.id);
      await reader.return?.();
    });

    it("reports a switch as a change of the new account", async () => {
      const { inner, second } = twoAccounts();
      const account = await window(new SharedFile());
      const reader = scopeToAccount(inner, account).changes()[Symbol.asyncIterator]();
      const next = reader.next();
      await account.select(second.id);
      expect((await next).value).toBe(second.id);
      await reader.return?.();
    });
  });

  it("reports nothing for a switch while no account is linked", async () => {
    const inner = new FakeAgentMessaging();
    const account = await window(new SharedFile());
    const reader = scopeToAccount(inner, account).changes()[Symbol.asyncIterator]();
    const next = reader.next();
    await account.select("paperclip:none");
    await vi.waitFor(() => expect(account.preferred()).toBe("paperclip:none"));
    const source = inner.addSource({ label: "Paperclip · Acme · Ada" });
    inner.addAgent(source.id, { name: "Chief" });
    expect((await next).value).toBe(source.id);
    await reader.return?.();
  });

  describe("HostActiveAccount", () => {
    it("over the window's loaded settings, reads nothing again and leaves them open", async () => {
      const file = new SharedFile();
      const read = vi.fn(file.store().read);
      const settings = new HostSettings({ ...file.store(), read });
      await settings.load();
      const account = new HostActiveAccount(settings);
      await account.load();
      expect(read).toHaveBeenCalledTimes(1);
      await account.select("paperclip:a");
      expect(account.preferred()).toBe("paperclip:a");
      account.dispose();
      expect(settings.loaded).toBe(true);
    });

    it("has no pick before it is loaded, and stops after dispose", async () => {
      const file = new SharedFile();
      const account = new HostActiveAccount(file.store());
      expect(account.preferred()).toBeUndefined();
      await account.load();
      const listener = vi.fn();
      account.subscribe(listener);
      account.dispose();
      expect(file.watchers.size).toBe(0);
      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores a change to another setting", async () => {
      const file = new SharedFile();
      const account = await window(file);
      const listener = vi.fn();
      account.subscribe(listener);
      await file.store().set("assistant.turn-limit", 3);
      await vi.waitFor(() => expect(file.values["assistant.turn-limit"]).toBe(3));
      await Promise.resolve();
      expect(listener).not.toHaveBeenCalled();
    });

    it("logs a re-read that fails and keeps the pick", async () => {
      const file = new SharedFile();
      const account = await window(file);
      await account.select("paperclip:a");
      const store = file.store();
      const failing = new HostActiveAccount({
        ...store,
        read: vi.fn().mockResolvedValueOnce({}).mockRejectedValue(new Error("busy")),
      });
      await failing.load();
      const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
      for (const watcher of file.watchers) watcher();
      await vi.waitFor(() => expect(logged).toHaveBeenCalled());
      logged.mockRestore();
    });
  });

  describe("with a stub port", () => {
    const mine = { source: "s1" };
    const theirs = { source: "s2" };
    const sources = [{ id: "s1" }, { id: "s2" }];
    const both = vi.fn().mockResolvedValue([mine, theirs]);
    const passed = vi.fn().mockResolvedValue("passed");
    const stub = {
      listSources: vi.fn().mockResolvedValue(sources),
      listAgents: both,
      listConversations: both,
      listInboxItems: both,
      listWork: both,
      search: both,
      browseChannels: both,
      listMessages: passed,
      answer: passed,
      readAttachment: passed,
      send: passed,
      startChannel: passed,
      setMembers: passed,
      joinChannel: passed,
      leaveChannel: passed,
      changes: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ done: true, value: undefined }),
        }),
      }),
    } as unknown as AgentMessaging;

    it("filters every read and passes every write through", async () => {
      const scoped = scopeToAccount(stub, await window(new SharedFile()));
      for (const read of [
        scoped.listAgents(),
        scoped.listConversations(),
        scoped.listInboxItems(),
        scoped.listWork(),
        scoped.search("x"),
        scoped.browseChannels(),
      ]) {
        expect(await read).toEqual([mine]);
      }
      const results = await Promise.all([
        scoped.listMessages("c"),
        scoped.answer("i", { kind: "approve" } as never),
        scoped.readAttachment("a"),
        scoped.send("c", "hi"),
        scoped.startChannel("t", [], "l"),
        scoped.setMembers("c", [], "l"),
        scoped.joinChannel("c"),
        scoped.leaveChannel("c"),
      ]);
      expect(results).toEqual(Array(8).fill("passed"));
    });

    it("ends when the port's changes end", async () => {
      const scoped = scopeToAccount(stub, await window(new SharedFile()));
      expect(await scoped.changes()[Symbol.asyncIterator]().next()).toEqual({
        done: true,
        value: undefined,
      });
    });
  });
});
