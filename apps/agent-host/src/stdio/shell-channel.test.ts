import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type Frame, FrameKind } from "./frame-codec.ts";
import type { HostConnection } from "./frame-stream.ts";
import { ShellChannel } from "./shell-channel.ts";

/** A secrets channel that keeps what reaches it. */
function recordingSecrets(): HostConnection & { received: string[] } {
  const received: string[] = [];
  return {
    received,
    open: () => {},
    receive: (frame) => received.push(frame.bytes.toString("utf8")),
    close: () => {},
  };
}

function dataFrame(value: unknown): Frame {
  return { connection: 0, kind: FrameKind.data, bytes: Buffer.from(JSON.stringify(value)) };
}

verifies("agent-host.opened-workspaces", () => {
  describe("ShellChannel", () => {
    it("takes a notice for itself and passes an answer that waits to the secrets channel", () => {
      const secrets = recordingSecrets();
      const opened: string[] = [];
      const channel = new ShellChannel(secrets, (folder) => opened.push(folder));

      channel.receive(dataFrame({ op: "open_workspace", folder: "/work/acme" }));
      channel.receive(dataFrame({ ok: true, value: null }));

      expect(opened).toEqual(["/work/acme"]);
      expect(secrets.received).toEqual(['{"ok":true,"value":null}']);
    });

    it("passes anything that isn't exactly a notice to the secrets channel, which judges it", () => {
      const secrets = recordingSecrets();
      const opened: string[] = [];
      const channel = new ShellChannel(secrets, (folder) => opened.push(folder));
      const notNotices = [
        { op: "open_workspace", folder: "/work/acme", extra: true },
        { op: "open_workspace", folder: "" },
        { op: "open_workspace", folder: 7 },
        { op: "close_workspace", folder: "/work/acme" },
        { op: "open_workspace" },
      ];
      for (const value of notNotices) channel.receive(dataFrame(value));
      channel.receive({ connection: 0, kind: FrameKind.data, bytes: Buffer.from("not json") });
      channel.receive({ connection: 0, kind: FrameKind.end, bytes: Buffer.alloc(0) });

      expect(opened).toEqual([]);
      expect(secrets.received).toHaveLength(notNotices.length + 2);
    });
  });
});
