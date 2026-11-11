import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isWslKernel, isWslShare, type NodePlace, nodeProblemOf, windowsDriveOf } from "./wsl.ts";

verifies("cli.doctor-windows-drive", () => {
  it("knows WSL by the Microsoft kernel in /proc/version", () => {
    expect(
      isWslKernel("Linux version 6.6.87.2-microsoft-standard-WSL2 (root@4d6c5bd8a0a5) #1 SMP"),
    ).toBe(true);
    expect(isWslKernel("Linux version 4.4.0-19041-Microsoft (Microsoft@Microsoft.com)")).toBe(true);
    expect(isWslKernel("Linux version 6.8.0-45-generic (buildd@lcy02-amd64-115) #45-Ubuntu")).toBe(
      false,
    );
  });

  it("finds the Windows drive WSL mounts under /mnt", () => {
    const onDriveC = "/mnt/c/work/acme"; // leak-guard: allow absolute-path an example WSL drive
    expect(windowsDriveOf(onDriveC)).toBe("/mnt/c");
    expect(windowsDriveOf("/mnt/D/work")).toBe("/mnt/D");
    expect(windowsDriveOf("/mnt/c")).toBe("/mnt/c");
  });

  it("finds none in Linux's own files, or in a folder under /mnt that isn't a drive", () => {
    expect(windowsDriveOf("/srv/acme")).toBeNull();
    expect(windowsDriveOf("/mnt/wslg/runtime")).toBeNull();
    expect(windowsDriveOf("/srv/mnt/c/acme")).toBeNull();
  });
});

/** A folder on each WSL share, as Windows reaches it. */
const wslDollar = "\\\\wsl$\\Ubuntu\\srv\\acme"; // leak-guard: allow absolute-path a WSL share
const wslLocalhost = "\\\\wsl.localhost\\Ubuntu\\srv\\acme"; // leak-guard: allow absolute-path a WSL share

/** A place with no problem; each test changes one part. */
const linuxAtHome: NodePlace = {
  platform: "linux",
  cwd: "/srv/acme",
  wsl: () => false,
  findPnpm: async () => "/usr/local/bin/pnpm",
};

verifies("cli.doctor-node", () => {
  it("knows a WSL folder as Windows reaches it", () => {
    expect(isWslShare(wslDollar)).toBe(true);
    expect(isWslShare(wslLocalhost)).toBe(true);
    expect(isWslShare("//WSL.LOCALHOST/Ubuntu/srv/acme")).toBe(true);
    expect(isWslShare("\\\\server\\share\\acme")).toBe(false);
    expect(isWslShare("\\\\wsl-backup\\acme")).toBe(false);
  });

  it("finds Windows' Node.js in a WSL folder", async () => {
    const windows = { ...linuxAtHome, platform: "win32" as const };

    expect(await nodeProblemOf({ ...windows, cwd: wslDollar })).toEqual({
      problem: "windows-node-in-wsl",
    });
    expect(await nodeProblemOf({ ...windows, cwd: "\\\\server\\share\\acme" })).toBeNull();
  });

  it("finds Windows' pnpm first on the PATH inside WSL", async () => {
    const pnpm = "/mnt/c/nodejs/pnpm"; // leak-guard: allow absolute-path an example WSL drive
    const wsl = { ...linuxAtHome, wsl: () => true };

    expect(await nodeProblemOf({ ...wsl, findPnpm: async () => pnpm })).toEqual({
      problem: "windows-pnpm",
      pnpm,
    });
    expect(await nodeProblemOf(wsl)).toBeNull();
    expect(await nodeProblemOf({ ...wsl, findPnpm: async () => null })).toBeNull();
  });

  it("doesn't look for pnpm outside WSL, nor on macOS", async () => {
    const asked: string[] = [];
    const findPnpm = async () => {
      asked.push("pnpm");
      return "/mnt/c/nodejs/pnpm"; // leak-guard: allow absolute-path an example WSL drive
    };

    expect(await nodeProblemOf({ ...linuxAtHome, findPnpm })).toBeNull();
    expect(await nodeProblemOf({ ...linuxAtHome, platform: "darwin", findPnpm })).toBeNull();
    expect(asked).toEqual([]);
  });
});
