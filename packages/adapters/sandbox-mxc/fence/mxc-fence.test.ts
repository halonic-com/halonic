import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { SandboxSession } from "@halonicjs/ports";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  finish,
  makeFolders,
  profileOver,
  type RealMxc,
  realMxc,
  type TestFolders,
} from "./real-box.ts";

/**
 * Tests against the real MXC fence. They need Windows 11 where MXC is
 * offered (the MXC fence CI job), so they live outside `src` and run with
 * `pnpm test:fence`, not with `pnpm test`. Where MXC isn't offered they fail,
 * on purpose: a run that proved nothing must not look like a pass.
 */
describe("MxcSandbox with the real fence", () => {
  let mxc: RealMxc;
  let folders: TestFolders;
  let session: SandboxSession;

  /** Runs Node with `script` in `target`. */
  async function node(script: string, target: SandboxSession = session) {
    return finish(await target.start({ program: process.execPath, args: ["-e", script] }));
  }

  beforeAll(async () => {
    mxc = await realMxc();
    folders = await makeFolders(mxc.base);
    session = await mxc.sandbox.open(profileOver(folders));
  });

  afterAll(async () => {
    await session?.close();
    await mxc?.remove();
  });

  it("is offered and can start on this computer", async () => {
    expect(await mxc.sandbox.offered()).toBe(true);
    expect(await mxc.sandbox.check()).toEqual({ ok: true, reason: null, missing: [] });
  });

  it("proves the fence", () => {
    expect(session.fence).toEqual({ state: "fenced" });
  });

  it("runs a program and gives its output and exit code", async () => {
    const { out, exit } = await node("console.log('hi'); process.exit(3)");
    expect(out.trim()).toBe("hi");
    expect(exit).toMatchObject({ code: 3, reason: "exited" });
  });

  it("hides a denied file from the program", async () => {
    const { out, exit } = await node(
      `console.log(require('node:fs').readFileSync(${JSON.stringify(folders.secret)}, 'utf8'))`,
    );
    expect(out).not.toContain("hunter2");
    expect(exit.code).not.toBe(0);
  });

  it("reads a read-only folder and can't change it", async () => {
    const target = join(folders.readOnly, "hello.txt");
    const { out } = await node(
      `const fs = require('node:fs'); console.log(fs.readFileSync(${JSON.stringify(target)}, 'utf8'));` +
        `try { fs.writeFileSync(${JSON.stringify(target)}, 'changed'); } catch { process.exit(7); }`,
    );
    expect(out.trim()).toBe("hello");
    expect(await readFile(target, "utf8")).toBe("hello");
  });

  it("writes the working folder and nowhere else", async () => {
    const inside = await node(
      `require('node:fs').writeFileSync(${JSON.stringify(join(folders.work, "made.txt"))}, 'x')`,
    );
    expect(inside.exit.code).toBe(0);
    expect(await readFile(join(folders.work, "made.txt"), "utf8")).toBe("x");
    const outside = await node(
      `require('node:fs').writeFileSync(${JSON.stringify(join(folders.outside, "x.txt"))}, 'x')`,
    );
    expect(outside.exit.code).not.toBe(0);
    await expect(stat(join(folders.outside, "x.txt"))).rejects.toThrow();
  });

  it("kill ends a program that doesn't end by itself", async () => {
    const started = await session.start({
      program: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
    });
    await started.kill();
    expect((await started.exited).reason).toBe("stopped");
  });

  it("gives each session its own box folder and removes it when the session closes", async () => {
    const base = join(mxc.dataFolder, "mxc-boxes");
    const first = await mxc.sandbox.open(profileOver(folders));
    const second = await mxc.sandbox.open(profileOver(folders));
    const during = (await readdir(base)).filter((name) => name.startsWith(`box-${process.pid}-`));
    expect(new Set(during).size).toBeGreaterThanOrEqual(2);
    await first.close();
    await second.close();
    const after = (await readdir(base)).filter((name) => name.startsWith(`box-${process.pid}-`));
    expect(after.length).toBeLessThan(during.length);
    // Only the main session of this file is still open.
    expect(after.length).toBeLessThanOrEqual(1);
  });

  it("stops a program when the time limit runs out", async () => {
    const short = await mxc.sandbox.open(profileOver(folders, { timeLimitMs: 4_000 }));
    try {
      const started = await short.start({
        program: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
      });
      expect((await started.exited).reason).toBe("timeout");
    } finally {
      await short.close();
    }
  });
});
