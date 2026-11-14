import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriUpdater } from "./tauri-updater.ts";
import type { UpdateStatus } from "./updater-status.ts";

const status = (current: string, automatic = true): UpdateStatus => ({
  current,
  automatic,
  checking: false,
  lastChecked: null,
  justUpdated: null,
  managed: null,
  state: { kind: "up-to-date" },
});

/** The shell's side: its commands, and the channels the page opened, in memory. */
function fakeShell() {
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const callbacks = new Map<number, (raw: unknown) => void>();
  const refused = new Set<string>();
  let next = 1;
  const ipc = {
    async invoke(command: string, args: Record<string, unknown> = {}) {
      calls.push({ command, args });
      if (refused.has(command)) throw "not allowed";
      return command === "update_restart" ? null : status("0.1.0", args["on"] !== false);
    },
    transformCallback(callback: (raw: unknown) => void) {
      const id = next++;
      callbacks.set(id, callback);
      return id;
    },
    unregisterCallback(id: number) {
      callbacks.delete(id);
    },
  };
  const send = (id: number, message: UpdateStatus, index = 0) =>
    callbacks.get(id)?.({ index, message });
  return { ipc, calls, callbacks, refused, send };
}

verifies("settings.updater-interface", () => {
  describe("TauriUpdater", () => {
    it("asks the shell's update commands", async () => {
      const shell = fakeShell();
      const updater = new TauriUpdater(shell.ipc);

      await updater.status();
      await updater.check();
      await updater.download();
      await updater.cancel();
      expect((await updater.setAutomatic(false)).automatic).toBe(false);
      await updater.restart();

      expect(shell.calls.map((call) => call.command)).toEqual([
        "update_status",
        "update_check",
        "update_download",
        "update_cancel",
        "update_set_automatic",
        "update_restart",
      ]);
      expect(shell.calls[4]?.args).toEqual({ on: false });
    });

    it("opens one watch channel for every listener, and tells each of them", () => {
      const shell = fakeShell();
      const updater = new TauriUpdater(shell.ipc);
      const first: string[] = [];
      const second: string[] = [];

      updater.subscribe((s) => first.push(s.current));
      shell.send(1, status("0.1.0"));
      updater.subscribe((s) => second.push(s.current));
      shell.send(1, status("0.1.1"), 1);

      expect(shell.calls.filter((call) => call.command === "update_watch")).toHaveLength(1);
      expect(shell.calls[0]?.args).toEqual({ onStatus: "__CHANNEL__:1" });
      expect(first).toEqual(["0.1.0", "0.1.1"]);
      expect(second).toEqual(["0.1.0", "0.1.1"]);
    });

    it("stops telling a listener once it stops, and keeps the channel for the rest", () => {
      const shell = fakeShell();
      const updater = new TauriUpdater(shell.ipc);
      const kept: string[] = [];
      const dropped: string[] = [];

      updater.subscribe((s) => kept.push(s.current));
      const stop = updater.subscribe((s) => dropped.push(s.current));
      stop();
      shell.send(1, status("0.1.0"));

      expect(kept).toEqual(["0.1.0"]);
      expect(dropped).toEqual([]);
      expect(shell.callbacks.size).toBe(1);
    });

    it("lets a listener that comes later start from the latest status", () => {
      const shell = fakeShell();
      const updater = new TauriUpdater(shell.ipc);
      const late: string[] = [];

      updater.subscribe(() => {});
      shell.send(1, status("0.1.0"));
      updater.subscribe((s) => late.push(s.current));

      expect(late).toEqual(["0.1.0"]);
    });

    it("tries the watch again for the next listener when the shell refuses it", async () => {
      const shell = fakeShell();
      shell.refused.add("update_watch");
      const updater = new TauriUpdater(shell.ipc);

      updater.subscribe(() => {});
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(shell.callbacks.size).toBe(0);

      shell.refused.clear();
      updater.subscribe(() => {});
      expect(shell.calls.filter((call) => call.command === "update_watch")).toHaveLength(2);
      expect(shell.callbacks.size).toBe(1);
    });
  });
});
