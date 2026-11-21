import type { AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { ServiceRegistry } from "@halonicjs/app";
import { RemoteControlService } from "@halonicjs/studio-feature-remote/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { provideRemoteControl } from "./provide-remote.ts";

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
