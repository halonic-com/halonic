import { errorKindOf } from "@halonicjs/std";
import { hostSettingsStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeHostSettingsShell } from "./fake-host-settings-shell.test-helper.ts";
import { type HostSettingsRefusalKind, isHostSettingsRefusal } from "./host-settings-commands.ts";
import { hostSettingsPollMs, TauriHostSettingsStore } from "./host-settings-store.ts";

hostSettingsStoreContract("tauri", async () => {
  const shell = new FakeHostSettingsShell();
  // Polled often, so a change elsewhere is heard within the contract's wait.
  const store = new TauriHostSettingsStore(shell, { pollMs: 10 });
  return {
    store,
    saved: async () => shell.text,
    brokenCopy: async () => shell.broken,
    writeSaved: async (text) => {
      shell.text = text;
    },
    changeElsewhere: async (key, value) => new TauriHostSettingsStore(shell).set(key, value),
  };
});

/** The error a call rejects with. */
async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

verifies("fs-tauri.host-settings-store", () => {
  describe("TauriHostSettingsStore", () => {
    it("sends each call to its host_settings_* command with the key and value, never a path", async () => {
      const shell = new FakeHostSettingsShell();
      const store = new TauriHostSettingsStore(shell);
      await store.set("assistant.turn-limit", 20);
      await store.set("assistant.model", null);
      await store.remove("assistant.model");
      expect(await store.read()).toEqual({ "assistant.turn-limit": 20 });
      expect(shell.calls).toEqual([
        { command: "host_settings_set", args: { key: "assistant.turn-limit", value: 20 } },
        { command: "host_settings_set", args: { key: "assistant.model", value: null } },
        { command: "host_settings_remove", args: { key: "assistant.model" } },
        { command: "host_settings_read", args: {} },
      ]);
    });

    it("refuses a number that isn't finite before the shell, which would get it as null", async () => {
      const shell = new FakeHostSettingsShell();
      const store = new TauriHostSettingsStore(shell);
      await expect(store.set("assistant.turn-limit", Number.NaN)).rejects.toThrow(RangeError);
      await expect(store.remove("Assistant.model")).rejects.toThrow(RangeError);
      expect(shell.calls).toEqual([]);
    });

    it("rejects with a RangeError when the shell finds the settings too large with the other keys", async () => {
      const shell = new FakeHostSettingsShell();
      const store = new TauriHostSettingsStore(shell);
      const half = "x".repeat(140 * 1024);
      await store.set("assistant.instructions", half);
      await expect(store.set("assistant.notes", half)).rejects.toThrow(RangeError);
      expect(await store.read()).toEqual({ "assistant.instructions": half });
    });

    it("turns the shell's refusals into the errors the port asks for", async () => {
      const cases: [HostSettingsRefusalKind, (reason: unknown) => void][] = [
        ["invalid_key", (reason) => expect(reason).toBeInstanceOf(RangeError)],
        ["too_large", (reason) => expect(reason).toBeInstanceOf(RangeError)],
        [
          "unreadable",
          (reason) => {
            // A plain Error, as `FileHostSettingsStore` throws it.
            expect(reason).toBeInstanceOf(Error);
            expect(reason).not.toBeInstanceOf(RangeError);
            expect(errorKindOf(reason)).toBe("internal");
            expect(String(reason)).toContain("can't be read: refused by the test (unreadable)");
          },
        ],
        [
          "io",
          (reason) => {
            expect(errorKindOf(reason)).toBe("unavailable");
            expect(String(reason)).toContain("refused by the test (io)");
          },
        ],
      ];
      for (const [kind, check] of cases) {
        const shell = new FakeHostSettingsShell();
        shell.refuseNext(kind);
        check(await rejection(new TauriHostSettingsStore(shell).read()));
      }
    });

    it("rejects as unavailable, without the text, when the page may not call the shell", async () => {
      const store = new TauriHostSettingsStore(new FakeHostSettingsShell({ granted: false }));
      for (const call of [
        store.read(),
        store.set("assistant.turn-limit", 20),
        store.remove("assistant.turn-limit"),
      ]) {
        const reason = await rejection(call);
        expect(errorKindOf(reason)).toBe("unavailable");
        expect(String(reason)).not.toContain("ACL");
      }
    });

    it("rejects as unavailable when the shell's answer isn't the settings", async () => {
      for (const answer of [null, [], "{}"]) {
        const store = new TauriHostSettingsStore({ invoke: async () => answer });
        expect(errorKindOf(await rejection(store.read()))).toBe("unavailable");
      }
    });

    it("tells a refusal from other rejections", () => {
      expect(isHostSettingsRefusal({ kind: "io", message: "disk full" })).toBe(true);
      expect(isHostSettingsRefusal({ kind: "declined", message: "no" })).toBe(false);
      expect(isHostSettingsRefusal({ kind: "io" })).toBe(false);
      expect(isHostSettingsRefusal("Command host_settings_read not allowed by ACL")).toBe(false);
      expect(isHostSettingsRefusal(null)).toBe(false);
    });
  });

  describe("TauriHostSettingsStore.watch", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** The `host_settings_read` calls so far. */
    const reads = (shell: FakeHostSettingsShell) =>
      shell.calls.filter(({ command }) => command === "host_settings_read").length;

    it("reads every 2 seconds while watched, and tells only when the settings differ", async () => {
      const shell = new FakeHostSettingsShell();
      const store = new TauriHostSettingsStore(shell);
      const elsewhere = new TauriHostSettingsStore(shell);
      const listener = vi.fn();
      await vi.advanceTimersByTimeAsync(10 * hostSettingsPollMs);
      expect(reads(shell)).toBe(0);

      const stop = store.watch(listener);
      await vi.advanceTimersByTimeAsync(0);
      expect(reads(shell)).toBe(1);
      await vi.advanceTimersByTimeAsync(2 * hostSettingsPollMs);
      expect(reads(shell)).toBe(3);
      expect(listener).not.toHaveBeenCalled();

      await elsewhere.set("assistant.turn-limit", 20);
      await vi.advanceTimersByTimeAsync(hostSettingsPollMs - 1);
      expect(listener).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(listener).toHaveBeenCalledTimes(1);

      // The same settings written again, keys in another order, are no change.
      shell.text = '{"values":{"assistant.turn-limit":20},"version":1}';
      await vi.advanceTimersByTimeAsync(hostSettingsPollMs);
      expect(listener).toHaveBeenCalledTimes(1);

      stop();
      const before = reads(shell);
      await elsewhere.set("assistant.turn-limit", 24);
      await vi.advanceTimersByTimeAsync(5 * hostSettingsPollMs);
      expect(reads(shell)).toBe(before);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("tells about its own save at once, without waiting for the next read", async () => {
      const shell = new FakeHostSettingsShell();
      const store = new TauriHostSettingsStore(shell);
      const listener = vi.fn();
      const stop = store.watch(listener);
      await vi.advanceTimersByTimeAsync(0);
      await store.set("assistant.turn-limit", 20);
      await vi.advanceTimersByTimeAsync(0);
      expect(listener).toHaveBeenCalledTimes(1);
      await store.remove("assistant.turn-limit");
      await vi.advanceTimersByTimeAsync(0);
      expect(listener).toHaveBeenCalledTimes(2);
      stop();
    });

    it("reads again after a read that was under way when a save landed", async () => {
      const shell = new FakeHostSettingsShell();
      const answers: (() => void)[] = [];
      // Each read takes the settings at once but answers only when the test says.
      const slow = {
        invoke: async (command: string, args?: Record<string, unknown>) => {
          const answer = await shell.invoke(command, args);
          if (command === "host_settings_read") {
            await new Promise<void>((resolve) => answers.push(resolve));
          }
          return answer;
        },
      };
      const store = new TauriHostSettingsStore(slow);
      const listener = vi.fn();
      const stop = store.watch(listener);
      await vi.advanceTimersByTimeAsync(0);
      answers.shift()?.();
      await vi.advanceTimersByTimeAsync(hostSettingsPollMs);

      // The poll's read holds the settings from before the save.
      await store.set("assistant.turn-limit", 20);
      answers.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(listener).not.toHaveBeenCalled();
      answers.shift()?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(listener).toHaveBeenCalledTimes(1);
      stop();
    });

    it("tells once when the settings can't be read, and again when they can", async () => {
      const shell = new FakeHostSettingsShell();
      const store = new TauriHostSettingsStore(shell);
      const listener = vi.fn();
      const stop = store.watch(listener);
      await vi.advanceTimersByTimeAsync(0);

      shell.refuseNext("unreadable");
      await vi.advanceTimersByTimeAsync(hostSettingsPollMs);
      expect(listener).toHaveBeenCalledTimes(1);
      shell.refuseNext("unreadable");
      await vi.advanceTimersByTimeAsync(hostSettingsPollMs);
      expect(listener).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(hostSettingsPollMs);
      expect(listener).toHaveBeenCalledTimes(2);
      stop();
    });

    it("never tells a watch that stopped while its read was under way", async () => {
      let release: () => void = () => undefined;
      let text = "{}";
      const store = new TauriHostSettingsStore({
        invoke: async () => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return JSON.parse(text);
        },
      });
      const listener = vi.fn();
      const stop = store.watch(listener);
      release();
      await vi.advanceTimersByTimeAsync(hostSettingsPollMs);
      text = '{"assistant.turn-limit":20}';
      stop();
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
