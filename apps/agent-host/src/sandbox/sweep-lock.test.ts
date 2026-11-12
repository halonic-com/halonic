import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { holdLock } from "@halonicjs/adapter-fs-node";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type HostIo, run } from "../host.ts";
import { argumentValues, hostLockFile, sweepRoots } from "./sweep-lock.ts";

/** A host started with `args`, the sweep roots its sandbox got, and what it wrote. */
function startHost(args: readonly string[]) {
  const input = new PassThrough();
  const errors: string[] = [];
  const given: string[][] = [];
  const sandboxes: SrtSandbox[] = [];
  let served: () => void = () => {};
  const handshake = new Promise<void>((resolve) => {
    served = resolve;
  });
  const io: HostIo = {
    input,
    write: () => served(),
    writeError: (text) => errors.push(text),
    takeOutput: () => {
      throw new Error("Only --stdio takes the output over.");
    },
  };
  const makeSandbox = (roots: readonly string[]) => {
    given.push([...roots]);
    const sandbox = new SrtSandbox(undefined, undefined, null, { sweepRoots: roots });
    vi.spyOn(sandbox, "sweepOnce").mockResolvedValue();
    sandboxes.push(sandbox);
    return sandbox;
  };
  const running = run(args, "1.2.3", io, makeSandbox);
  return { input, errors, given, sandboxes, handshake, running };
}

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

verifies("agent-host.sweep-lock", () => {
  describe("the host lock and the sweep roots", () => {
    let profile: string;
    beforeEach(async () => {
      profile = await mkdtemp(join(tmpdir(), "agent-host-lock-"));
    });
    afterEach(async () => {
      await rm(profile, { recursive: true, force: true });
    });

    it("holds the lock while it serves, sweeps every root once, and removes the lock at the end", async () => {
      const roots = [join(profile, "workspaces"), join(profile, "acme")];
      const host = startHost([
        "--profile-folder",
        profile,
        "--sweep-root",
        roots[0] ?? "",
        "--sweep-root",
        roots[1] ?? "",
      ]);
      await host.handshake;
      expect(host.given).toEqual([roots]);
      expect(host.sandboxes[0]?.sweepOnce).toHaveBeenCalledOnce();
      expect(await exists(hostLockFile(profile))).toBe(true);
      host.input.end();
      expect(await host.running).toBe(0);
      expect(await exists(hostLockFile(profile))).toBe(false);
      expect(host.errors).toEqual([]);
    });

    it("serves without a sweep while another live host holds the lock, and says why", async () => {
      await mkdir(join(profile, "agent-host"));
      const other = await holdLock(hostLockFile(profile), {
        onLost: () => {},
        onRenewError: () => {},
      });
      try {
        const host = startHost(["--profile-folder", profile, "--sweep-root", profile]);
        await host.handshake;
        expect(host.given).toEqual([[]]);
        expect(host.sandboxes[0]?.sweepOnce).not.toHaveBeenCalled();
        expect(host.errors.join()).toMatch(/doesn't sweep kept grants: The lock .* is held/);
        host.input.end();
        expect(await host.running).toBe(0);
        // The other host's lock is still there.
        expect(await exists(hostLockFile(profile))).toBe(true);
      } finally {
        await other.release();
      }
    });

    it("takes no lock and sweeps nothing without a profile folder", async () => {
      const host = startHost(["--sweep-root", profile]);
      await host.handshake;
      expect(host.given).toEqual([[]]);
      expect(host.sandboxes[0]?.sweepOnce).not.toHaveBeenCalled();
      host.input.end();
      expect(await host.running).toBe(0);
      expect(await exists(hostLockFile(profile))).toBe(false);
    });

    it("refuses a relative or missing sweep root with exit code 2", async () => {
      for (const args of [["--sweep-root", "runs"], ["--sweep-root"]]) {
        const host = startHost(["--profile-folder", profile, ...args]);
        expect(await host.running).toBe(2);
        expect(host.errors).toEqual([
          "The agent host needs an absolute folder after each --sweep-root.\n",
        ]);
        expect(host.given).toEqual([]);
      }
      expect(await exists(hostLockFile(profile))).toBe(false);
    });
  });
});

describe("argumentValues and sweepRoots", () => {
  it("gives every value of a repeated option, in order", () => {
    expect(argumentValues(["--a", "1", "--b", "2", "--a", "3"], "--a")).toEqual(["1", "3"]);
    expect(argumentValues(["--a"], "--a")).toEqual([]);
  });

  it("gives no roots when none are named", () => {
    expect(sweepRoots(["--stdio"])).toEqual({ roots: [] });
  });
});
