import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { FakeTunnelProvider } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HostIo, run } from "../host.ts";
import type { RemoteOffer } from "../remote/host-remote.ts";

/** What a port held by `heldPort` answers, so a reply from anyone else shows. */
const held = "held by the test";

/**
 * A port the test keeps listening on until the test ends. The "listens on no
 * port" checks hold theirs instead of borrowing a free number: another test
 * file's host may take a borrowed number, and its reply would look like this
 * host's. A host that tried this port would fail and say so.
 */
async function heldPort(): Promise<number> {
  const sockets = new Set<Socket>();
  const holder = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.end(held);
  });
  await new Promise<void>((resolve) => holder.listen(0, "127.0.0.1", resolve));
  const { port } = holder.address() as { port: number };
  holders.push(() => {
    const closed = new Promise<void>((resolve) => holder.close(() => resolve()));
    for (const socket of sockets) socket.destroy();
    return closed;
  });
  return port;
}

const holders: (() => Promise<void>)[] = [];

/** Checks the host never tried to listen on `port`: the test still holds it and the host said nothing about it. */
async function expectNoGateway(port: number, errors: readonly string[]): Promise<void> {
  expect(await requestTo(port)).toBe(held);
  expect(errors.join("")).not.toContain("The remote gateway didn't start");
}

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

function startHost(args: readonly string[], remote?: RemoteOffer) {
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
    remote === undefined
      ? run(args, "1.2.3", io, makeSandbox)
      : run(args, "1.2.3", io, makeSandbox, remote);
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

const profiles: string[] = [];

afterEach(async () => {
  for (const release of holders.splice(0)) await release();
  for (const profile of profiles.splice(0)) await rm(profile, { recursive: true, force: true });
});

/** A new profile folder, with the remote switch as the person left it. */
async function profileWithRemote(on: boolean): Promise<string> {
  const profile = await mkdtemp(join(tmpdir(), "halonic-gateway-host-"));
  profiles.push(profile);
  await mkdir(join(profile, "remote"), { recursive: true });
  const settings = { version: 1, on, allowRiskyRemotely: false };
  await writeFile(join(profile, "remote", "remote.json"), JSON.stringify(settings));
  return profile;
}

/** Resolves once `check` holds, looking again after each turn of the event loop. */
async function eventually(check: () => Promise<boolean>): Promise<void> {
  while (!(await check())) await new Promise((resolve) => setImmediate(resolve));
}

verifies("agent-host.remote-gateway", () => {
  describe("the host's switch for the remote gateway", () => {
    it("listens on no port for the gateway without a tunnel provider, as the executable where tailscale isn't installed", async () => {
      const port = await heldPort();
      const host = startHost(["--profile-folder", await profileWithRemote(true)]);
      await host.handshake;
      host.input.end();
      expect(await host.running).toBe(0);
      await expectNoGateway(port, host.errors);
    });

    it("ignores --remote-gateway on the command line: the launch arguments can't turn it on", async () => {
      const port = await heldPort();
      const host = startHost(["--remote-gateway", "--remote-gateway-port", String(port)]);
      await host.handshake;
      host.input.end();
      expect(await host.running).toBe(0);
      await expectNoGateway(port, host.errors);
    });

    it("listens on no port while remote is off, even with a provider", async () => {
      const port = await heldPort();
      const profile = await profileWithRemote(false);
      const host = startHost(["--profile-folder", profile], {
        tunnel: new FakeTunnelProvider(),
        gatewayPort: port,
      });
      await host.handshake;
      host.input.end();
      expect(await host.running).toBe(0);
      await expectNoGateway(port, host.errors);
    });

    it("listens on the gateway's port while remote is on with a provider, and closes it at the end", async () => {
      const port = await freePort();
      const profile = await profileWithRemote(true);
      const host = startHost(["--profile-folder", profile], {
        tunnel: new FakeTunnelProvider(),
        gatewayPort: port,
      });
      await host.handshake;
      await eventually(async () => (await requestTo(port)) !== "refused");
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
      const profile = await profileWithRemote(true);
      const host = startHost(["--profile-folder", profile], {
        tunnel: new FakeTunnelProvider(),
        gatewayPort: port,
      });
      await host.handshake;
      await eventually(async () =>
        host.errors.join("").includes("The remote gateway didn't start"),
      );
      host.input.end();
      expect(await host.running).toBe(0);
      holder.close();
    });

    it("offers no remote over --stdio, and says why", async () => {
      const port = await heldPort();
      const profile = await profileWithRemote(true);
      const host = startHost(
        ["--stdio", "--relay-host", "127.0.0.1:4999", "--profile-folder", profile],
        { tunnel: new FakeTunnelProvider(), gatewayPort: port },
      );
      await host.handshake;
      expect(host.errors.join("")).toContain("over --stdio the host listens on none");
      host.input.end();
      await host.running;
      await expectNoGateway(port, host.errors);
    });

    it("offers no remote without a profile folder, and says why", async () => {
      const port = await heldPort();
      const host = startHost([], { tunnel: new FakeTunnelProvider(), gatewayPort: port });
      await host.handshake;
      expect(host.errors.join("")).toContain("no profile folder");
      host.input.end();
      expect(await host.running).toBe(0);
      await expectNoGateway(port, host.errors);
    });
  });
});
