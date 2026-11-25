import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { KeepAwakeService, RemoteControlService } from "@halonicjs/studio-feature-remote/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { provideKeepAwake, provideRemoteControl } from "./provide-remote.ts";

/** A transport that records the stream it was asked for and hands back no lines. */
function recordingTransport(opened: string[]): AgentHostTransport {
  return {
    request: () => Promise.resolve({ status: 200, body: { ok: true } }),
    stream: (route) => {
      opened.push(route);
      return Promise.resolve({
        ok: false,
        answer: { status: 500, body: { error: { kind: "remote_failed", message: "test" } } },
      });
    },
  };
}

describe("provideRemoteControl", () => {
  verifies("studio.remote-control", () => {
    it("gives Settings › Remote the host's RemoteControl over the transport", async () => {
      const services = new ServiceRegistry();
      const opened: string[] = [];
      provideRemoteControl(services, recordingTransport(opened));

      const remote = services.get(RemoteControlService);
      await expect(remote.state()[Symbol.asyncIterator]().next()).rejects.toThrow("test");
      expect(opened).toEqual(["GET /v1/remote/state"]);
    });

    it("gives none outside the desktop app", () => {
      const services = new ServiceRegistry();
      provideRemoteControl(services, undefined);
      expect(services.has(RemoteControlService)).toBe(false);
    });
  });
});

describe("provideKeepAwake", () => {
  verifies("remote.keep-awake", () => {
    it("calls keep_awake_set with both switches, in the main window only", async () => {
      const calls: unknown[] = [];
      const ipc = {
        invoke: (command: string, args?: Record<string, unknown>) => {
          calls.push([command, args]);
          return Promise.resolve(true);
        },
      };
      const main = new ServiceRegistry();
      provideKeepAwake(main, ipc, "main");
      const inbox = new ServiceRegistry();
      provideKeepAwake(inbox, ipc, "inbox");
      const served = new ServiceRegistry();
      provideKeepAwake(served, undefined, undefined);

      await expect(main.get(KeepAwakeService).set(true, false)).resolves.toBe(true);
      expect(calls).toEqual([["keep_awake_set", { keep: true, remote: false }]]);
      expect(inbox.has(KeepAwakeService)).toBe(false);
      expect(served.has(KeepAwakeService)).toBe(false);
    });

    it("throws the shell's refusal", async () => {
      const services = new ServiceRegistry();
      provideKeepAwake(services, { invoke: () => Promise.reject("failed") }, "main");

      await expect(services.get(KeepAwakeService).set(true, true)).rejects.toThrow("failed");
    });
  });
});
