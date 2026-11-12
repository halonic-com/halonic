import { chmod, mkdtemp, readdir, rename, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { OpenHarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openBridge } from "./bridge.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import { sendToSocket } from "./raw-client.test-helper.ts";
import type { BridgeRoute } from "./route.ts";
import {
  emptyRunFolderMinAgeMs,
  makeRunSocketFolder,
  sweepRunSocketFolders,
} from "./socket-folder.ts";

/** A route that answers 204, so a test can tell the bridge still serves. */
const ping: BridgeRoute = {
  method: "GET",
  path: "/ping",
  handle: async ({ response }) => {
    response.statusCode = 204;
    response.end();
  },
};

let parent = "";
let bridges = "";

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), "bridge-sweep-"));
  bridges = join(parent, "bridges");
});

afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

/**
 * Makes a run folder as a host that crashed leaves it: its socket stays, and
 * nothing listens on it. A closing server removes its socket, so the socket
 * is renamed to the bridge's name while it listens.
 */
async function leftOverRunFolder(name: string): Promise<string> {
  const run = await makeRunSocketFolder(bridges, { name });
  const server = createServer();
  const listening = join(run.folder, "listening.sock");
  await new Promise<void>((resolve) => server.listen(listening, resolve));
  await rename(listening, run.socketPath);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return run.folder;
}

/** Makes an empty run folder last changed `ageMs` ago. */
async function emptyRunFolder(name: string, ageMs: number): Promise<string> {
  const { folder } = await makeRunSocketFolder(bridges, { name });
  const changed = new Date(Date.now() - ageMs);
  await utimes(folder, changed, changed);
  return folder;
}

verifies("harness-bridge.socket-sweep", () => {
  describe("sweepRunSocketFolders", () => {
    it("removes a run folder whose socket nothing listens on any more", async () => {
      await leftOverRunFolder("crashed");

      expect(await sweepRunSocketFolders(bridges)).toEqual(["crashed"]);
      expect(await readdir(bridges)).toEqual([]);
    });

    it("leaves a live bridge's run folder, and the bridge still serves", async () => {
      await leftOverRunFolder("crashed");
      const bridge: OpenHarnessBridge = await openBridge(fakeRun(), {
        place: { kind: "socket", folder: bridges },
        limits: { maxBytes: 1024, timeoutMs: 5_000 },
        routes: [ping],
        closeTimeoutMs: 1_000,
      });
      try {
        const socketPath = bridge.socketPath ?? "";

        expect(await sweepRunSocketFolders(bridges)).toEqual(["crashed"]);
        expect(await readdir(bridges)).toEqual([basename(dirname(socketPath))]);
        const reply = await sendToSocket(socketPath, {
          method: "GET",
          target: "/ping",
          host: "bridge.halonic.invalid",
          token: bridge.token,
        });
        expect(reply.status).toBe(204);
      } finally {
        await bridge.close();
      }
    });

    it("removes an empty run folder only once it is old enough", async () => {
      await emptyRunFolder("old", 2 * emptyRunFolderMinAgeMs);
      await emptyRunFolder("new", 0);

      expect(await sweepRunSocketFolders(bridges)).toEqual(["old"]);
      expect(await readdir(bridges)).toEqual(["new"]);
    });

    it("leaves a link, a folder others may open, a folder with more in it, and a plain file named like the socket", async () => {
      const elsewhere = join(parent, "elsewhere");
      await leftOverRunFolder("target");
      await rename(join(bridges, "target"), elsewhere);
      await symlink(elsewhere, join(bridges, "link"));
      const open = await leftOverRunFolder("open");
      await chmod(open, 0o755);
      const crowded = await leftOverRunFolder("crowded");
      await writeFile(join(crowded, "notes.txt"), "kept");
      const plain = await emptyRunFolder("plain", 0);
      await writeFile(join(plain, "bridge.sock"), "not a socket");

      expect(await sweepRunSocketFolders(bridges)).toEqual([]);
      expect((await readdir(bridges)).sort()).toEqual(["crowded", "link", "open", "plain"]);
      expect(await readdir(elsewhere)).toEqual(["bridge.sock"]);
    });

    it("removes nothing, and creates nothing, without a socket folder", async () => {
      expect(await sweepRunSocketFolders(bridges)).toEqual([]);
      expect(await readdir(parent)).toEqual([]);
    });

    it("refuses a socket folder others can write to, and removes nothing", async () => {
      await leftOverRunFolder("crashed");
      await chmod(bridges, 0o777);

      await expect(sweepRunSocketFolders(bridges)).rejects.toThrow("isn't private to this user");
      expect(await readdir(bridges)).toEqual(["crashed"]);
    });
  });
});
