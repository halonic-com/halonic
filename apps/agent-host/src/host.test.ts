import { PassThrough } from "node:stream";
import { type Machine, SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { describe, expect, it } from "vitest";
import { type FramedHandshake, type Handshake, type HostIo, run } from "./host.ts";
import { FrameKind } from "./stdio/frame-codec.ts";
import { TestRelay } from "./stdio/relay.test-helper.ts";

/**
 * A Windows machine whose install the test controls: nothing really runs.
 *
 * @param state - whether srt's install is there at first, and how the
 *   administrator prompt is answered when it installs (yes, unless given)
 */
function windows(state: { installed: boolean; prompt?: "installed" | "cancelled" }): Machine {
  const answer = state.prompt ?? "installed";
  return {
    platform: "win32",
    insideContainer: async () => false,
    hasBubblewrap: async () => false,
    hasLinuxHelpers: async () => false,
    userNamespacesRestricted: async () => false,
    hasSeatbelt: async () => false,
    hasWindowsSandbox: async () => state.installed,
    installWindowsSandbox: async () => {
      state.installed ||= answer === "installed";
      return answer;
    },
    letSandboxReadParents: async () => undefined,
  };
}

/** A stand-in for the program that starts the host: it holds the input and reads the output. */
function starter() {
  const input = new PassThrough();
  const lines: string[] = [];
  let lineArrived: () => void = () => {};
  const io: HostIo = {
    input,
    write: (text: string) => {
      lines.push(text);
      lineArrived();
    },
    writeError: () => {},
    takeOutput: () => {
      throw new Error("Only --stdio takes the output over.");
    },
  };
  const nextLine = () =>
    lines.length > 0
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          lineArrived = resolve;
        });
  return { io, input, lines, nextLine };
}

describe("run", () => {
  it("prints its version with --version", async () => {
    const { io, lines } = starter();
    expect(await run(["--version"], "1.2.3", io)).toBe(0);
    expect(lines).toEqual(["halonic-agent-host 1.2.3\n"]);
  });

  it("says whether the sandbox works here with --sandbox-check, in its exit code too", async () => {
    const { io, lines } = starter();
    const code = await run(["--sandbox-check"], "1.2.3", io);
    const check = JSON.parse(lines[0] ?? "") as { ok: boolean };
    expect(typeof check.ok).toBe("boolean");
    expect(code).toBe(check.ok ? 0 : 1);
  });

  it("exits with 1 when the sandbox can't start here", async () => {
    const { io, lines } = starter();
    const noWindowsInstall = new SrtSandbox(windows({ installed: false }));
    expect(await run(["--sandbox-check"], "1.2.3", io, noWindowsInstall)).toBe(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ ok: false, reason: "setup-needed" });
  });

  it("sets the sandbox up with --sandbox-setup, and says so on one JSON line", async () => {
    const { io, lines } = starter();
    const sandbox = new SrtSandbox(windows({ installed: false }));
    expect(await run(["--sandbox-setup"], "1.2.3", io, sandbox)).toBe(0);
    expect(await run(["--sandbox-setup"], "1.2.3", io, sandbox)).toBe(0);
    expect(lines).toEqual(['{"ok":true}\n', '{"ok":true}\n']);
  });

  it("exits with 1 and gives the setup's reason when it didn't work", async () => {
    const { io, lines } = starter();
    const cancelled = new SrtSandbox(windows({ installed: false, prompt: "cancelled" }));
    expect(await run(["--sandbox-setup"], "1.2.3", io, cancelled)).toBe(1);
    expect(lines).toEqual([
      '{"ok":false,"reason":"the administrator prompt was cancelled; nothing changed"}\n',
    ]);
  });

  it("serves until its input closes, after one handshake line", async () => {
    const { io, input, lines, nextLine } = starter();
    const running = run([], "1.2.3", io);
    await nextLine();
    const handshake = JSON.parse(lines[0] ?? "") as Handshake;
    expect(Object.keys(handshake)).toEqual(["url", "token"]);

    const health = await fetch(`${handshake.url}/v1/health`, {
      headers: { authorization: `Bearer ${handshake.token}` },
    });
    expect(await health.json()).toEqual({ ok: true, version: "1.2.3" });
    expect((await fetch(`${handshake.url}/v1/health`)).status).toBe(401);

    input.end();
    expect(await running).toBe(0);
    await expect(fetch(`${handshake.url}/v1/health`)).rejects.toThrow();
    expect(lines).toHaveLength(1);
  });
});

describe("run --stdio", () => {
  const relayPort = 50_123;

  /** A relay in front of a host started with `args`, with what the host wrote to standard error. */
  function relayed(args: readonly string[]) {
    const relay = new TestRelay(true);
    const errors: string[] = [];
    const io: HostIo = {
      input: relay.streams.input,
      write: () => {
        throw new Error("--stdio writes only through the output it took over.");
      },
      writeError: (text) => errors.push(text),
      takeOutput: () => relay.streams.output,
    };
    const sandbox = new SrtSandbox(windows({ installed: true }));
    return { relay, errors, running: run(args, "1.2.3", io, sandbox) };
  }

  it("serves every route over frames after a handshake with only the token, until its input ends", async () => {
    const { relay, running } = relayed(["--stdio", "--relay-host", `127.0.0.1:${relayPort}`]);
    const handshake = JSON.parse(await relay.handshakeLine()) as FramedHandshake;
    expect(Object.keys(handshake)).toEqual(["token"]);
    const headers = { host: `127.0.0.1:${relayPort}`, authorization: `Bearer ${handshake.token}` };
    const post = (path: string, body: unknown) =>
      relay.request(path, { method: "POST", headers, body: JSON.stringify(body) });

    const health = await relay.request("/v1/health", { headers });
    expect(JSON.parse(health.body)).toEqual({ ok: true, version: "1.2.3" });
    expect((await relay.request("/v1/sandbox/capabilities", { headers })).status).toBe(200);
    const harnesses = await relay.request("/v1/harnesses", { headers });
    expect(JSON.parse(harnesses.body)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
    );
    expect((await post("/v1/sandbox/sessions/close", { session: "unknown" })).status).toBe(404);
    expect((await post("/v1/bridge/close", { bridge: "unknown" })).status).toBe(404);
    expect((await post("/v1/harnesses/runs/cancel", { run: "unknown" })).status).toBe(404);

    const otherPort = { ...headers, host: "127.0.0.1:50124" };
    expect((await relay.request("/v1/health", { headers: otherPort })).status).toBe(421);
    expect((await relay.request("/v1/health", { headers: { host: headers.host } })).status).toBe(
      401,
    );

    relay.streams.input.end();
    expect(await running).toBe(0);
  });

  it("stops with 1, and says why on standard error, when the frame stream breaks", async () => {
    const { relay, errors, running } = relayed([
      "--stdio",
      "--relay-host",
      `127.0.0.1:${relayPort}`,
    ]);
    await relay.handshakeLine();
    relay.sendFrame(7, FrameKind.data, Buffer.from("x"));
    expect(await running).toBe(1);
    expect(errors.join("")).toMatch(/never opened/);
  });

  it.each([[[]], [["--relay-host", "localhost:50123"]], [["--relay-host", "127.0.0.1:70000"]]])(
    "exits with 2 without a relay port on 127.0.0.1 (%j)",
    async (relayArgs) => {
      const { relay, errors, running } = relayed(["--stdio", ...relayArgs]);
      expect(await running).toBe(2);
      expect(errors.join("")).toMatch(/--relay-host 127\.0\.0\.1:<port>/);
      expect(relay.handshake).toBeUndefined();
    },
  );
});
