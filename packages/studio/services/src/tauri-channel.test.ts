import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FakeShell } from "./fake-shell.test-helper.ts";
import { TauriChannel } from "./tauri-channel.ts";

function openChannel(): { shell: FakeShell; channel: TauriChannel; read: unknown[] } {
  const shell = new FakeShell();
  const read: unknown[] = [];
  const channel = new TauriChannel(shell, (message) => read.push(message));
  return { shell, channel, read };
}

verifies("services.tauri-channel", () => {
  describe("TauriChannel", () => {
    it("is passed to a command as __CHANNEL__ and the callback's id", () => {
      const { shell, channel } = openChannel();

      expect(channel.argument).toMatch(/^__CHANNEL__:\d+$/);
      expect(shell.registered(channel.argument)).toBe(true);
    });

    it("reads messages in index order, holding one until the ones before it have come", () => {
      const { shell, channel, read } = openChannel();

      shell.send(channel.argument, { index: 1, message: "second" });
      expect(read).toEqual([]);
      shell.send(channel.argument, { index: 0, message: "first" });
      shell.send(channel.argument, { index: 2, message: "third" });

      expect(read).toEqual(["first", "second", "third"]);
    });

    it("removes the callback once the end marker and every message before it have come", () => {
      const { shell, channel, read } = openChannel();

      shell.send(channel.argument, { index: 0, message: "first" });
      shell.send(channel.argument, { index: 2, end: true });
      expect(shell.registered(channel.argument)).toBe(true);
      shell.send(channel.argument, { index: 1, message: "last" });

      expect(read).toEqual(["first", "last"]);
      expect(shell.registered(channel.argument)).toBe(false);
    });

    it("removes the callback at once for an end marker with nothing still to come", () => {
      const { shell, channel } = openChannel();

      shell.send(channel.argument, { index: 0, end: true });

      expect(shell.registered(channel.argument)).toBe(false);
    });

    it("drops what comes after it is closed, also from its own reader, and closes once", () => {
      const shell = new FakeShell();
      const read: unknown[] = [];
      const channel: TauriChannel = new TauriChannel(shell, (message) => {
        read.push(message);
        channel.close();
      });

      shell.send(channel.argument, { index: 1, message: "held" });
      const argument = channel.argument;
      shell.send(argument, { index: 0, message: "closes" });
      channel.close();

      expect(read).toEqual(["closes"]);
      expect(shell.registered(argument)).toBe(false);
    });

    it.each([
      ["not an object", "line"],
      ["null", null],
      ["without an index", { message: "x" }],
      ["with a negative index", { index: -1, message: "x" }],
      ["with neither a message nor an end", { index: 0 }],
    ])("ignores a raw message %s", (_, raw) => {
      const { shell, channel, read } = openChannel();

      shell.send(channel.argument, raw);
      shell.send(channel.argument, { index: 0, message: "first" });

      expect(read).toEqual(["first"]);
    });
  });
});
