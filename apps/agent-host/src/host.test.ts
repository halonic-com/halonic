import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { type Machine, SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { describe, expect, it } from "vitest";
import { type FramedHandshake, type Handshake, type HostIo, run } from "./host.ts";
import { FrameKind } from "./stdio/frame-codec.ts";
import { TestRelay } from "./stdio/relay.test-helper.ts";

/**
 * A Windows machine whose install the test controls: nothing really runs.
 *
 * @param state - whether srt's install is there at first, and whether the
 *   administrator prompt is answered yes (unless given) or cancelled
 */
function windows(state: { installed: boolean; prompt?: "yes" | "cancelled" }): Machine {
  const cancelled = state.prompt === "cancelled";
  return {
    platform: "win32",
    insideContainer: async () => false,
    isWsl1: async () => false,
    hasBubblewrap: async () => false,
    missingLinuxHelpers: async () => ["socat" as const, "ripgrep" as const],
    hasRipgrep: async () => false,
    bubblewrapUserNamespaceError: async () => null,
    appArmorRestrictsUserNamespaces: async () => false,
    hasSeatbelt: async () => false,
    packageManager: async () => null,
    windowsSandboxState: async () =>
      state.installed ? ("ok" as const) : ("setup-needed" as const),
    installWindowsSandbox: async () => {
      if (cancelled) return "cancelled";
      state.installed = true;
      return "installed";
    },
    uninstallWindowsSandbox: async () => {
      if (cancelled) return "cancelled";
      state.installed = false;
      return "removed";
    },
    letSandboxReadParents: async () => undefined,
    forgetSandboxParents: async () => undefined,
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
    expect(await run(["--sandbox-check"], "1.2.3", io, () => noWindowsInstall)).toBe(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ ok: false, reason: "setup-needed" });
  });

  it("sets the sandbox up with --sandbox-setup, and says so on one JSON line", async () => {
    const { io, lines } = starter();
    const sandbox = new SrtSandbox(windows({ installed: false }));
    expect(await run(["--sandbox-setup"], "1.2.3", io, () => sandbox)).toBe(0);
    expect(await run(["--sandbox-setup"], "1.2.3", io, () => sandbox)).toBe(0);
    expect(lines).toEqual(['{"ok":true}\n', '{"ok":true}\n']);
  });

  it("exits with 1 and gives the setup's reason when it didn't work", async () => {
    const { io, lines } = starter();
    const cancelled = new SrtSandbox(windows({ installed: false, prompt: "cancelled" }));
    expect(await run(["--sandbox-setup"], "1.2.3", io, () => cancelled)).toBe(1);
    expect(lines).toEqual([
      '{"ok":false,"outcome":"cancelled","reason":"the administrator prompt was cancelled; nothing changed"}\n',
    ]);
  });

  it("removes the sandbox with --sandbox-remove, also when run again, on one JSON line", async () => {
    const { io, lines } = starter();
    const state = { installed: true };
    const sandbox = new SrtSandbox(windows(state));
    expect(await run(["--sandbox-remove"], "1.2.3", io, () => sandbox)).toBe(0);
    expect(state.installed).toBe(false);
    expect(await run(["--sandbox-remove"], "1.2.3", io, () => sandbox)).toBe(0);
    expect(lines).toEqual(['{"ok":true}\n', '{"ok":true}\n']);
  });

  it("is done with --sandbox-remove when the sandbox was never set up", async () => {
    const { io, lines } = starter();
    const sandbox = new SrtSandbox(windows({ installed: false }));
    expect(await run(["--sandbox-remove"], "1.2.3", io, () => sandbox)).toBe(0);
    expect(lines).toEqual(['{"ok":true}\n']);
  });

  it("exits with 1 and gives the removal's reason when it didn't work", async () => {
    const { io, lines } = starter();
    const state = { installed: true, prompt: "cancelled" as const };
    const cancelled = new SrtSandbox(windows(state));
    expect(await run(["--sandbox-remove"], "1.2.3", io, () => cancelled)).toBe(1);
    expect(state.installed).toBe(true);
    expect(lines).toEqual([
      '{"ok":false,"outcome":"cancelled","reason":"the administrator prompt was cancelled; nothing changed"}\n',
    ]);
  });

  it("cleans up for the uninstaller with --sandbox-cleanup, and gives the reason when it can't", async () => {
    const { io, lines } = starter();
    const machine = windows({ installed: true });
    // A profile folder set with HALONIC_HOME, outside LOCALAPPDATA.
    const chosenProfile = ["D:", "halonic-home"].join("\\");
    const forgotten: string[] = [];
    machine.forgetSandboxParents = async (profileFolder) => {
      forgotten.push(profileFolder);
    };
    const cleanup = ["--profile-folder", chosenProfile, "--sandbox-cleanup"];
    expect(await run(cleanup, "1.2.3", io, () => new SrtSandbox(machine))).toBe(0);
    expect(forgotten).toEqual([chosenProfile]);
    machine.forgetSandboxParents = async () => {
      throw new Error("icacls failed");
    };
    expect(await run(cleanup, "1.2.3", io, () => new SrtSandbox(machine))).toBe(1);
    expect(await run(["--sandbox-cleanup"], "1.2.3", io, () => new SrtSandbox(machine))).toBe(1);
    expect(lines).toEqual([
      '{"ok":true}\n',
      '{"ok":false,"reason":"icacls failed"}\n',
      '{"ok":false,"reason":"--sandbox-cleanup needs --profile-folder."}\n',
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

describe("run with the Google routes", () => {
  /** Serves with `args`, asks the Google disconnect route about an account nobody set up, and stops. */
  async function disconnectAnswer(args: readonly string[]): Promise<string> {
    const { io, input, lines, nextLine } = starter();
    const running = run(args, "1.2.3", io);
    await nextLine();
    const handshake = JSON.parse(lines[0] ?? "") as Handshake;
    const answer = await fetch(`${handshake.url}/v1/google/disconnect`, {
      method: "POST",
      headers: { authorization: `Bearer ${handshake.token}`, "content-type": "application/json" },
      body: JSON.stringify({ accountRef: "gaccount_missing1" }),
    });
    const text = `${answer.status} ${await answer.text()}`;
    input.end();
    await running;
    return text;
  }

  it("serves the Google disconnect route for the profile folder it was given", async () => {
    const profile = await mkdtemp(join(tmpdir(), "halonic-host-profile-"));
    try {
      expect(await disconnectAnswer(["--profile-folder", profile])).toMatch(
        /^404 .*"kind":"google_setup_not_found"/u,
      );
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  });

  it("serves no Google route without a profile folder", async () => {
    // The host's own 404 for a path it doesn't serve, not the route's answer for a missing account.
    expect(await disconnectAnswer([])).toMatch(/^404 .*"not_found"/u);
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
    return { relay, errors, running: run(args, "1.2.3", io, () => sandbox) };
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
