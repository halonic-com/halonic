import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriEngineLock } from "./engine-lock.ts";
import { FakeEngineLockShell } from "./fake-engine-lock-shell.test-helper.ts";

const workspace = "/work/acme";

function setup() {
  const shell = new FakeEngineLockShell({ opened: [workspace] });
  return { shell, lock: new TauriEngineLock(shell, workspace) };
}

async function rejection(action: Promise<unknown>): Promise<unknown> {
  return action.then(
    () => expect.unreachable("the call should have failed"),
    (reason: unknown) => reason,
  );
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

verifies("fs-tauri.engine-lock", () => {
  describe("TauriEngineLock", () => {
    it("holds the workspace as opened, with a channel, and gives it back on release", async () => {
      const { shell, lock } = setup();
      const held = await lock.hold(() => {});
      expect(shell.calls).toEqual([
        { command: "engine_lock_hold", args: { workspace, onLost: "__CHANNEL__:0" } },
      ]);
      expect(shell.holds(workspace)).toBe(true);

      await held.release();
      await held.release();
      expect(shell.holds(workspace)).toBe(false);
      expect(shell.openChannels).toBe(0);
      expect(shell.calls.filter((call) => call.command === "engine_lock_release")).toEqual([
        { command: "engine_lock_release", args: { workspace } },
      ]);
    });

    it("calls onLost once when the shell says another process took the lock over", async () => {
      const { shell, lock } = setup();
      const lost: Error[] = [];
      await lock.hold((error) => lost.push(error));

      shell.lose(workspace);
      await flush();
      expect(lost.map((error) => error.message)).toEqual([
        "The engine lock was taken over by another process.",
      ]);
      expect(shell.openChannels).toBe(0);
    });

    it("says the lock was lost even when the shell's message has no text", async () => {
      const { shell, lock } = setup();
      const lost: Error[] = [];
      const channelsBefore = shell.openChannels;
      await lock.hold((error) => lost.push(error));
      // The shell's own message shape is checked, not trusted.
      const channel = shell.calls[0]?.args?.["onLost"];
      expect(channelsBefore).toBe(0);
      expect(typeof channel).toBe("string");
      shell.sendRaw(String(channel), null);
      await flush();
      expect(lost.map((error) => error.message)).toEqual(["The engine lock was lost."]);
    });

    it("is refused as conflict while another engine holds the lock, and leaves no channel open", async () => {
      const { shell, lock } = setup();
      shell.holdElsewhere(workspace);
      const error = await rejection(lock.hold(() => {}));
      expect(errorKindOf(error)).toBe("conflict");
      expect((error as Error).message).toBe("Another engine is open on this workspace.");
      expect((error as Error).cause).toMatchObject({ kind: "conflict", pid: 4242 });
      expect(shell.openChannels).toBe(0);
    });

    it("tells the page that reloaded, not the one that left", async () => {
      const { shell, lock } = setup();
      const before: Error[] = [];
      const after: Error[] = [];
      await lock.hold((error) => before.push(error));
      await lock.hold((error) => after.push(error));
      shell.lose(workspace);
      await flush();
      expect(after).toHaveLength(1);
      expect(before).toHaveLength(0);
    });

    it("is refused as conflict by a process that took the lock while no page held it", async () => {
      const { shell, lock } = setup();
      shell.lose(workspace);
      await flush();
      expect(errorKindOf(await rejection(lock.hold(() => {})))).toBe("conflict");
    });

    it("is denied for a workspace that isn't open", async () => {
      const { shell } = setup();
      const error = await rejection(new TauriEngineLock(shell, "/work/other").hold(() => {}));
      expect(errorKindOf(error)).toBe("denied");
    });

    it("is unavailable when the shell has an io problem", async () => {
      const { shell, lock } = setup();
      shell.refuseNext("io");
      expect(errorKindOf(await rejection(lock.hold(() => {})))).toBe("unavailable");
    });

    it("is unavailable, without the shell's text, when it isn't the shell's refusal", async () => {
      const shell = new FakeEngineLockShell({ opened: [workspace] });
      shell.invoke = async () => {
        throw "Command engine_lock_hold not allowed by ACL";
      };
      const error = await rejection(new TauriEngineLock(shell, workspace).hold(() => {}));
      expect(errorKindOf(error)).toBe("unavailable");
      expect((error as Error).message).not.toContain("ACL");
      expect(shell.openChannels).toBe(0);
    });

    it("rejects a release the shell refuses", async () => {
      const { shell, lock } = setup();
      const held = await lock.hold(() => {});
      shell.refuseNext("io");
      expect(errorKindOf(await rejection(held.release()))).toBe("unavailable");
    });
  });
});
