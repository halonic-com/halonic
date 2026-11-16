import { connect, createServer } from "node:net";
import { PassThrough } from "node:stream";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type HostIo, run } from "../host.ts";
import type { GatewaySettings } from "./gateway-settings.ts";

/** A port nothing listens on now. */
function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function startHost(args: readonly string[], gateway?: GatewaySettings) {
  const input = new PassThrough();
  const errors: string[] = [];
  let served: () => void = () => {};
  const handshake = new Promise<void>((resolve) => {
    served = resolve;
  });
  const io: HostIo = {
    input,
    write: () => served(),
    writeError: (text) => errors.push(text),
    takeOutput: () => {
      served();
      return new PassThrough();
    },
  };
  const makeSandbox = () => {
    const sandbox = new SrtSandbox(undefined, undefined, null, { sweepRoots: [] });
    vi.spyOn(sandbox, "sweepOnce").mockResolvedValue();
    return sandbox;
  };
  const running =
    gateway === undefined
      ? run(args, "1.2.3", io, makeSandbox)
      : run(args, "1.2.3", io, makeSandbox, gateway);
  return { input, errors, handshake, running };
}

/** What the port answers to a plain HTTP request, or `"refused"`. */
function requestTo(port: number): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    let text = "";
    socket.on("connect", () => socket.write("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"));
    socket.on("data", (chunk) => {
      text += String(chunk);
    });
    socket.on("close", () => resolve(text));
    socket.on("error", () => resolve("refused"));
  });
}

verifies("agent-host.remote-gateway", () => {
  describe("the host's switch for the remote gateway", () => {
    it("listens on no port for the gateway by default", async () => {
      const port = await freePort();
      const host = startHost([]);
      await host.handshake;
      expect(await requestTo(port)).toBe("refused");
      host.input.end();
      expect(await host.running).toBe(0);
    });

    it("ignores --remote-gateway on the command line: the launch arguments can't turn it on", async () => {
      const port = await freePort();
      const host = startHost(["--remote-gateway", "--remote-gateway-port", String(port)]);
      await host.handshake;
      expect(await requestTo(port)).toBe("refused");
      host.input.end();
      expect(await host.running).toBe(0);
    });

    it("listens on the named port when the caller of run turns it on, and closes it at the end", async () => {
      const port = await freePort();
      const host = startHost([], { enabled: true, port });
      await host.handshake;
      expect(await requestTo(port)).toMatch(/^HTTP\/1\.1 /);
      host.input.end();
      expect(await host.running).toBe(0);
      expect(await requestTo(port)).toBe("refused");
      expect(host.errors).toEqual([]);
    });

    it("serves without the gateway, and says why, when its port is taken", async () => {
      const holder = createServer();
      await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", resolve));
      const { port } = holder.address() as { port: number };
      const host = startHost([], { enabled: true, port });
      await host.handshake;
      expect(host.errors.join("")).toContain("The remote gateway didn't start");
      host.input.end();
      expect(await host.running).toBe(0);
      holder.close();
    });

    it("stays off over --stdio, and says why", async () => {
      const port = await freePort();
      const host = startHost(["--stdio", "--relay-host", "127.0.0.1:4999"], {
        enabled: true,
        port,
      });
      await host.handshake;
      expect(await requestTo(port)).toBe("refused");
      expect(host.errors.join("")).toContain("stays off");
      host.input.end();
      await host.running;
    });
  });
});
