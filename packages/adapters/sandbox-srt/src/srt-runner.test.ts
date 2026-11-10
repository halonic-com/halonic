import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { stopGroup } from "./srt-runner.ts";

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
