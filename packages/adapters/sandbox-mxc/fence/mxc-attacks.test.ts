import type { AddressInfo } from "node:net";
import { createServer, type Server } from "node:net";
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
 * Attacks against the real fence: a program that tries to get out the ways a
 * misbehaving agent would. Like `mxc-fence.test.ts`, these need Windows 11
 * where MXC is offered and run with `pnpm test:fence`.
 */
describe("a program trying to get out of the MXC fence", () => {
  let mxc: RealMxc;
  let folders: TestFolders;
  let session: SandboxSession;
  let listener: Server;
  let listenerPort: number;
  let reached = false;

  async function node(script: string) {
    return finish(await session.start({ program: process.execPath, args: ["-e", script] }));
  }

  beforeAll(async () => {
    mxc = await realMxc();
    folders = await makeFolders(mxc.base);
    listener = createServer((socket) => {
      reached = true;
      socket.destroy();
    });
    await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
    listenerPort = (listener.address() as AddressInfo).port;
    session = await mxc.sandbox.open(profileOver(folders));
  });

  afterAll(async () => {
    await session?.close();
    listener?.close();
    await mxc?.remove();
  });

  it("can't connect to a port of this computer that isn't the bridge", async () => {
    const { exit } = await node(
      `const s = require('node:net').connect(${listenerPort}, '127.0.0.1');` +
        "s.on('connect', () => process.exit(0)); s.on('error', () => process.exit(9));",
    );
    expect(exit.code).not.toBe(0);
    expect(reached).toBe(false);
  });

  it("can't read a denied file by a path that goes around it", async () => {
    const around = join(folders.secrets, "..", "secrets", "key.txt");
    const { out } = await node(
      `console.log(require('node:fs').readFileSync(${JSON.stringify(around)}, 'utf8'))`,
    );
    expect(out).not.toContain("hunter2");
  });

  it("can't read a denied file through a symlink it makes", async () => {
    const link = join(folders.work, "link.txt");
    const { out } = await node(
      `const fs = require('node:fs');` +
        `try { fs.symlinkSync(${JSON.stringify(folders.secret)}, ${JSON.stringify(link)}); } catch {}` +
        `try { console.log(fs.readFileSync(${JSON.stringify(link)}, 'utf8')); } catch { process.exit(5); }`,
    );
    expect(out).not.toContain("hunter2");
  });

  it("can't write where it only may read, with a path that climbs out of the working folder", async () => {
    const climbing = join(folders.work, "..", "outside", "x.txt");
    const { exit } = await node(
      `require('node:fs').writeFileSync(${JSON.stringify(climbing)}, 'x')`,
    );
    expect(exit.code).not.toBe(0);
  });

  it("is not fenced, and runs nothing, when the denied path holds Halonic's box folders", async () => {
    const trap = await mxc.sandbox.open(profileOver(folders, { deniedPaths: [mxc.dataFolder] }));
    try {
      expect(trap.fence.state).toBe("not-fenced");
      await expect(trap.start({ program: process.execPath, args: ["-v"] })).rejects.toThrow();
    } finally {
      await trap.close();
    }
  });

  it("refuses a profile with allowed sites, and runs nothing", async () => {
    await expect(
      mxc.sandbox.open(
        profileOver(folders, {
          network: {
            bridge: { kind: "loopback", host: "127.0.0.1", port: 4100 },
            allowedSites: ["example.invalid"],
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
