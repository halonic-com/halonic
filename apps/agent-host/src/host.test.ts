import { PassThrough } from "node:stream";
import { type Machine, SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { describe, expect, it } from "vitest";
import { type Handshake, run } from "./host.ts";

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
  };
}

/** A stand-in for the program that starts the host: it holds the input and reads the output. */
function starter() {
  const input = new PassThrough();
  const lines: string[] = [];
  let lineArrived: () => void = () => {};
  const io = {
    input,
    write: (text: string) => {
      lines.push(text);
      lineArrived();
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
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ ok: false, reason: "windows" });
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
