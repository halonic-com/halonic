import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { TailscaleReply, TailscaleRunner } from "@halonicjs/adapter-tunnel-tailscale";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Handshake, type HostIo, runExecutable } from "../host.ts";
import { tailscaleProbe } from "./tailscale-offer.ts";

const nodeName = "studio.tail1234.ts.net";
const tunnelHost = `${nodeName}:8443`;
const done = (stdout = ""): TailscaleReply => ({ kind: "done", code: 0, stdout, stderr: "" });

/** A `tailscale` on a signed-in node that keeps the one serve entry it was given, as tailscaled does. */
class FakeTailscale implements TailscaleRunner {
  readonly calls: string[][] = [];
  /** Where the serve entry proxies to, while there is one. */
  target: string | undefined;

  readonly installed: boolean;

  constructor(installed = true) {
    this.installed = installed;
  }

  async run(args: readonly string[]): Promise<TailscaleReply> {
    this.calls.push([...args]);
    if (!this.installed) return { kind: "missing" };
    if (args[0] === "status") {
      return done(
        JSON.stringify({
          BackendState: "Running",
          Self: { DNSName: `${nodeName}.`, Online: true },
        }),
      );
    }
    if (args[1] === "status") {
      const web =
        this.target === undefined
          ? {}
          : { [tunnelHost]: { Handlers: { "/": { Proxy: this.target } } } };
      return done(JSON.stringify({ Web: web }));
    }
    if (args.includes("off")) this.target = undefined;
    else this.target = args.at(-1);
    return done();
  }

  /** The gateway's loopback port, from the entry tailscale serves. */
  gatewayPort(): number {
    return Number(new URL(this.target ?? "http://127.0.0.1:0").port);
  }
}

const profiles: string[] = [];

afterEach(async () => {
  for (const profile of profiles.splice(0)) await rm(profile, { recursive: true, force: true });
});

/** A new profile folder; with `remoteOn`, the remote switch as the person left it. */
async function newProfile(remoteOn?: boolean): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), "halonic-executable-remote-"));
  profiles.push(profile);
  if (remoteOn === undefined) return profile;
  await mkdir(join(profile, "remote"), { recursive: true });
  const settings = { version: 1, on: remoteOn, allowRiskyRemotely: false };
  await writeFile(join(profile, "remote", "remote.json"), JSON.stringify(settings));
  return profile;
}

/** Starts the host as the executable does, on `tailscale`, and waits for its handshake. */
async function startExecutable(profile: string, tailscale: FakeTailscale) {
  const input = new PassThrough();
  let handshakeLine: (line: string) => void = () => {};
  const line = new Promise<string>((resolve) => {
    handshakeLine = resolve;
  });
  const io: HostIo = {
    input,
    write: (text) => handshakeLine(text),
    writeError: () => {},
    takeOutput: () => new PassThrough(),
  };
  const makeSandbox = () => {
    const sandbox = new SrtSandbox(undefined, undefined, null, { sweepRoots: [] });
    vi.spyOn(sandbox, "sweepOnce").mockResolvedValue();
    return sandbox;
  };
  const running = runExecutable(["--profile-folder", profile], "1.2.3", {
    io,
    makeSandbox,
    probe: tailscaleProbe(tailscale),
  });
  const handshake = JSON.parse(await line) as Handshake;
  const headers = { authorization: `Bearer ${handshake.token}` };
  return {
    stop: async () => {
      input.end();
      return await running;
    },
    /** The first remote state the host streams. */
    state: async () => {
      const leave = new AbortController();
      const answer = await fetch(`${handshake.url}/v1/remote/state`, {
        headers,
        signal: leave.signal,
      });
      const reader = (answer.body as ReadableStream<Uint8Array>).getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      leave.abort();
      return JSON.parse(first.split("\n")[0] ?? "") as Record<string, unknown>;
    },
  };
}

/** The status line the gateway's port gives a plain request with `headers`, or `"refused"`. */
function statusLine(port: number, headers: string[]): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    let text = "";
    socket.on("connect", () =>
      socket.write(
        `GET /v1/gateway HTTP/1.1\r\n${headers.join("\r\n")}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString("base64")}\r\n\r\n`,
      ),
    );
    socket.on("data", (chunk) => {
      text += String(chunk);
      socket.destroy();
    });
    socket.on("close", () => resolve(text.split("\r\n")[0] ?? ""));
    socket.on("error", () => resolve("refused"));
  });
}

/** Resolves once `check` holds, looking again after each turn of the event loop. */
async function eventually(check: () => boolean): Promise<void> {
  while (!check()) await new Promise((resolve) => setImmediate(resolve));
}

verifies("agent-host.remote-gateway", () => {
  describe("the executable's own entry point", () => {
    it("serves the gateway through the Tailscale tunnel while remote is left on, and stops it with the host", async () => {
      const tailscale = new FakeTailscale();
      const host = await startExecutable(await newProfile(true), tailscale);
      await eventually(() => tailscale.target !== undefined);
      const port = tailscale.gatewayPort();
      expect(tailscale.target).toBe(`http://127.0.0.1:${port}`);
      expect(await statusLine(port, [`Host: ${tunnelHost}`])).toBe(
        "HTTP/1.1 101 Switching Protocols",
      );
      expect(await host.stop()).toBe(0);
      expect(tailscale.target).toBeUndefined();
      expect(await statusLine(port, [`Host: ${tunnelHost}`])).toBe("refused");
    });

    it("refuses a request that came through Funnel, and trusts no Tailscale identity header", async () => {
      const tailscale = new FakeTailscale();
      const host = await startExecutable(await newProfile(true), tailscale);
      await eventually(() => tailscale.target !== undefined);
      const port = tailscale.gatewayPort();
      expect(await statusLine(port, [`Host: ${tunnelHost}`, "Tailscale-Funnel-Request: ?1"])).toBe(
        "HTTP/1.1 403 Forbidden",
      );
      // An identity header gets a request no further than its Host does: the phone's pairing key decides.
      expect(
        await statusLine(port, ["Host: evil.example", "Tailscale-User-Login: owner@example.com"]),
      ).toBe("HTTP/1.1 421 Misdirected Request");
      expect(await host.stop()).toBe(0);
    });

    it("offers remote, off and without a listener, on a fresh profile", async () => {
      const tailscale = new FakeTailscale();
      const host = await startExecutable(await newProfile(), tailscale);
      expect(await host.state()).toMatchObject({
        available: true,
        on: false,
        tunnelProviderId: "tailscale",
        phones: [],
      });
      expect(tailscale.calls.some((call) => call.includes("--bg"))).toBe(false);
      expect(await host.stop()).toBe(0);
    });
  });
});

verifies("agent-host.remote-not-offered", () => {
  describe("the executable's own entry point", () => {
    it("offers no remote where tailscale isn't installed, even with remote left on", async () => {
      const tailscale = new FakeTailscale(false);
      const host = await startExecutable(await newProfile(true), tailscale);
      expect(await host.state()).toMatchObject({ available: false, on: false });
      expect(tailscale.calls).toEqual([["status", "--json"]]);
      expect(await host.stop()).toBe(0);
    });
  });
});
