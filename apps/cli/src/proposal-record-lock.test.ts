import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { LockHeldError } from "@halonicjs/adapter-fs-node";
import { runLockFormat } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { folderRecordLock } from "./proposal-record-lock.ts";

let folder: string;

beforeEach(() => {
  folder = join(mkdtempSync(join(tmpdir(), "halonic-cli-record-lock-")), "proposals");
});

afterEach(() => {
  rmSync(join(folder, ".."), { recursive: true, force: true });
});

/** A promise and what settles it, so a test holds a lock for as long as it wants. */
function gate() {
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

verifies("cli.proposal-record-lock", () => {
  describe("the record lock of a workspace's proposals", () => {
    it("makes a second taker of the same run wait until the first has released it", async () => {
      // Two locks on one folder stand in for two processes: each holds its own lock file.
      const first = folderRecordLock(folder);
      const second = folderRecordLock(folder);
      const steps: string[] = [];
      const holding = gate();
      const firstWork = first("01JD8Q", async () => {
        steps.push("first starts");
        await holding.opened;
        steps.push("first ends");
      });
      await expect.poll(() => steps).toEqual(["first starts"]);

      const secondWork = second("01JD8Q", async () => {
        steps.push("second runs");
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(steps).toEqual(["first starts"]);
      holding.open();
      await Promise.all([firstWork, secondWork]);

      expect(steps).toEqual(["first starts", "first ends", "second runs"]);
    });

    it("doesn't make the taker of another run wait", async () => {
      const holding = gate();
      const firstWork = folderRecordLock(folder)("01JD8Q", () => holding.opened);
      await expect.poll(() => existsSync(join(folder, "01JD8Q.lock"))).toBe(true);

      await expect(folderRecordLock(folder)("7KQ2MX", async () => "decided")).resolves.toBe(
        "decided",
      );
      holding.open();
      await firstWork;
    });

    it("gives up after the wait, naming the process that holds the lock", async () => {
      const holding = gate();
      const firstWork = folderRecordLock(folder)("01JD8Q", () => holding.opened);
      await expect.poll(() => existsSync(join(folder, "01JD8Q.lock"))).toBe(true);

      const waited = folderRecordLock(folder, 100)("01JD8Q", async () => "decided");

      await expect(waited).rejects.toBeInstanceOf(LockHeldError);
      await expect(waited).rejects.toThrow(`process ${process.pid} on ${hostname()}`);
      holding.open();
      await firstWork;
    });

    it("releases the lock when the work fails, and gives the work's error", async () => {
      const failing = folderRecordLock(folder)("01JD8Q", async () => {
        throw new Error("The record can't be read.");
      });

      await expect(failing).rejects.toThrow("The record can't be read.");
      expect(existsSync(join(folder, "01JD8Q.lock"))).toBe(false);
    });

    it("takes over the lock a process left when it ended", async () => {
      await folderRecordLock(folder)("01JD8Q", async () => {});
      const exited = spawnSync(process.execPath, ["--eval", ""]).pid;
      const left = {
        version: runLockFormat,
        pid: exited,
        host: hostname(),
        takenAt: new Date().toISOString(),
      };
      await writeFile(join(folder, "01JD8Q.lock"), JSON.stringify(left), "utf8");

      const seen = await folderRecordLock(folder)("01JD8Q", () =>
        readFile(join(folder, "01JD8Q.lock"), "utf8"),
      );

      expect(JSON.parse(seen).pid).toBe(process.pid);
      expect(existsSync(join(folder, "01JD8Q.lock"))).toBe(false);
    });
  });
});
