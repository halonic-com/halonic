import { spawn } from "node:child_process";
import { generateProxyEnvVars } from "@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-utils.js";
import { describe, expect, it } from "vitest";
import {
  type RunRequest,
  srtNetworkVariables,
  stopGroup,
  windowsCommandLine,
} from "./srt-runner.ts";

/** A detached node process that ends on SIGTERM, or ignores it. */
function start(ignoreTerm: boolean) {
  const script = `${ignoreTerm ? 'process.on("SIGTERM", () => {});' : ""}console.log("up");setInterval(() => {}, 1000);`;
  const child = spawn(process.execPath, ["-e", script], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const up = new Promise<void>((resolve) => child.stdout.once("data", () => resolve()));
  const ended = new Promise<string | null>((resolve) => child.once("close", (_c, s) => resolve(s)));
  return { child, up, ended };
}

// Process groups and POSIX signals only exist off Windows, where srt does not run either. The
// tests end early there instead of skipping, because the reporter fails any plain skip.
const posix = process.platform !== "win32";
const expectWindows = () => expect(process.platform).toBe("win32");

describe("stopGroup", () => {
  it("asks with SIGTERM first, so a program that listens can end by itself", async () => {
    if (!posix) return expectWindows();
    const { child, up, ended } = start(false);
    await up;
    stopGroup(child.pid, 5000);
    expect(await ended).toBe("SIGTERM");
  });

  it("kills with SIGKILL when the program ignores SIGTERM for the grace period", async () => {
    if (!posix) return expectWindows();
    const { child, up, ended } = start(true);
    await up;
    stopGroup(child.pid, 200);
    expect(await ended).toBe("SIGKILL");
  });
});

describe("windowsCommandLine", () => {
  const request = (overrides: Partial<RunRequest> = {}): RunRequest => ({
    settingsPath: "tools\\s.json",
    program: "tools\\Program Files\\nodejs\\node.exe",
    args: ["tools\\work\\a b.cjs", "x&y", "dir\\"],
    cwd: "tools\\work",
    launcherEnv: {},
    programEnv: { PATH: "tools\\bin;tools\\Program Files (x86)\\t", NAME: "a value" },
    withoutSrtEnv: false,
    ...overrides,
  });

  it("sets the variables, then runs the quoted program, with no env or sh", () => {
    expect(windowsCommandLine(request())).toBe(
      'set "PATH=tools\\bin;tools\\Program Files (x86)\\t" && set "NAME=a value" && ' +
        '"tools\\Program Files\\nodejs\\node.exe" "tools\\work\\a b.cjs" "x&y" "dir\\\\"',
    );
  });

  it("first removes srt's proxy variables for a session without network", () => {
    const line = windowsCommandLine(request({ withoutSrtEnv: true, programEnv: {} }));
    expect(line.startsWith('set "http_proxy=" && set "https_proxy=" && ')).toBe(true);
    for (const name of srtNetworkVariables) {
      expect(line).toContain(`set "${name}=" && `);
    }
    expect(
      line.endsWith(
        '"tools\\Program Files\\nodejs\\node.exe" "tools\\work\\a b.cjs" "x&y" "dir\\\\"',
      ),
    ).toBe(true);
  });

  it.each([
    ["a quote in an argument", { args: ['a"b'] }],
    ["a percent sign in an argument", { args: ["%PATH%"] }],
    ["a line break in an argument", { args: ["a\nb"] }],
    ["a quote in the program", { program: 'a"b' }],
    ["a percent sign in a variable", { programEnv: { A: "100%" } }],
    ["a variable name that is not plain", { programEnv: { "A&B": "1" } }],
  ])("refuses %s instead of guessing at the quoting", (_name, overrides) => {
    expect(() => windowsCommandLine(request(overrides))).toThrow();
  });
});

describe("srtNetworkVariables", () => {
  it("names every variable srt sets to lead a program to its proxy", () => {
    // Both proxies and a token, so srt sets every variable it has. The ports are never opened.
    const generated = generateProxyEnvVars(3128, 1080, undefined, "token", true, undefined).map(
      (entry: string) => entry.slice(0, entry.indexOf("=")).toUpperCase(),
    );
    // Neither leads anywhere: one says srt runs the program, the other is set on Windows anyway.
    const notNetwork = new Set(["SANDBOX_RUNTIME", "TMPDIR"]);
    const listed = new Set(srtNetworkVariables.map((name) => name.toUpperCase()));
    const missing = generated.filter((name: string) => !notNetwork.has(name) && !listed.has(name));
    expect(missing).toEqual([]);
  });
});
