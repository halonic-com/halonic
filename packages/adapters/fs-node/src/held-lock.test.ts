import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { type RunLockRecord, runLockFormat, runLockStaleAfterMs } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type HeldLock,
  heldLockRenewEveryMs,
  holdLock,
  LockHeldError,
  type RenewTimer,
} from "./held-lock.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);
afterEach(() => {
  vi.useRealTimers();
});

/** The renewals a test runs by hand, in the order they were planned. */
let planned: { renew: () => Promise<void>; ms: number; cancelled: boolean }[];
let lost: Error[];
let renewErrors: unknown[];

beforeEach(() => {
  planned = [];
  lost = [];
  renewErrors = [];
});

const handTimer: RenewTimer = (renew, ms) => {
  const entry = { renew, ms, cancelled: false };
  planned.push(entry);
  return () => {
    entry.cancelled = true;
  };
};

/** Runs the renewal planned last. */
async function renewNow(): Promise<void> {
  const next = planned.at(-1);
  if (next === undefined || next.cancelled) {
    throw new Error("No renewal is planned.");
  }
  await next.renew();
}

function hold(file: string): Promise<HeldLock> {
  return holdLock(file, {
    onLost: (error) => lost.push(error),
    onRenewError: (error) => renewErrors.push(error),
    setTimer: handTimer,
  });
}

/** A lock record taken now by `pid` on `host`. */
function record(pid: number, host = hostname()): RunLockRecord {
  return { version: runLockFormat, pid, host, takenAt: new Date().toISOString() };
}

/** A lock file path in a new folder, with `text` planted in it when given. */
async function lockFile(text?: string): Promise<string> {
  const file = join(await tempFolder(), "engine.lock");
  if (text !== undefined) {
    await writeFile(file, text, "utf8");
  }
  return file;
}

async function heldRecord(file: string): Promise<RunLockRecord> {
  return JSON.parse(await readFile(file, "utf8"));
}

verifies("fs-node.held-lock", () => {
  it("takes a free lock with this process's record, and removes it on release", async () => {
    const file = await lockFile();

    const lock = await hold(file);

    expect(await heldRecord(file)).toMatchObject({
      version: runLockFormat,
      pid: process.pid,
      host: hostname(),
    });
    await lock.release();
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a lock a running process on this computer holds, naming it", async () => {
    const holder = record(process.pid);
    const file = await lockFile(JSON.stringify(holder));

    const refused = hold(file);

    await expect(refused).rejects.toBeInstanceOf(LockHeldError);
    await expect(refused).rejects.toMatchObject({
      holder,
      message: `The lock ${file} is held by process ${process.pid} on ${holder.host}, since ${holder.takenAt}.`,
    });
    expect(await heldRecord(file)).toEqual(holder);
  });

  it("refuses a fresh lock whose record isn't written yet", async () => {
    const file = await lockFile("");

    await expect(hold(file)).rejects.toThrow(`The lock ${file} is held by another process.`);
  });

  it("takes over the lock of a process that has exited", async () => {
    const exited = spawnSync(process.execPath, ["--eval", ""]).pid;
    const file = await lockFile(JSON.stringify(record(exited)));

    const lock = await hold(file);

    expect((await heldRecord(file)).pid).toBe(process.pid);
    await lock.release();
  });

  it("renews the lock with a later takenAt, and still removes it on release", async () => {
    const file = await lockFile();
    const lock = await hold(file);
    const taken = await heldRecord(file);
    vi.useFakeTimers({ toFake: ["Date"], now: Date.parse(taken.takenAt) + heldLockRenewEveryMs });

    await renewNow();

    const renewed = await heldRecord(file);
    expect(renewed.pid).toBe(process.pid);
    expect(Date.parse(renewed.takenAt)).toBe(Date.parse(taken.takenAt) + heldLockRenewEveryMs);
    expect(planned.map((entry) => entry.ms)).toEqual([heldLockRenewEveryMs, heldLockRenewEveryMs]);
    expect(await readdir(join(file, ".."))).toEqual(["engine.lock"]);
    await lock.release();
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(planned.at(-1)?.cancelled).toBe(true);
  });

  it("tells the holder when another process took the lock over, and leaves that lock alone", async () => {
    const file = await lockFile();
    const lock = await hold(file);
    const other = JSON.stringify(record(process.pid, "another-computer"));
    await writeFile(file, other, "utf8");

    await renewNow();

    expect(lost).toEqual([new Error(`The lock ${file} was taken over by another process.`)]);
    expect(planned).toHaveLength(1);
    await lock.release();
    expect(await readFile(file, "utf8")).toBe(other);
  });

  it("gives up its lock as lost when it missed renewing it for the stale limit", async () => {
    const file = await lockFile();
    const lock = await hold(file);
    const taken = await heldRecord(file);
    // The computer slept past the stale limit, so another process may be taking it over now.
    vi.useFakeTimers({
      toFake: ["Date"],
      now: Date.parse(taken.takenAt) + runLockStaleAfterMs + 1,
    });

    await renewNow();

    expect(lost).toEqual([
      new Error(`The lock ${file} wasn't renewed within the stale limit, so it was given up.`),
    ]);
    expect(planned).toHaveLength(1);
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    await lock.release();
  });

  it.skipIf(process.platform === "win32")(
    "fails instead of trying for ever when the lock is a link to a missing file",
    async () => {
      const file = await lockFile();
      await symlink(join(file, "..", "missing"), file);

      await expect(hold(file)).rejects.toThrow("is a link to a file that isn't there");
    },
  );

  it("reports a failed renewal and tries again at the next one", async () => {
    const file = await lockFile();
    const lock = await hold(file);
    const ownText = await readFile(file, "utf8");
    await rm(file);
    await mkdir(file);

    await renewNow();

    expect(renewErrors).toEqual([expect.objectContaining({ code: "EISDIR" })]);
    expect(lost).toEqual([]);
    await rm(file, { recursive: true });
    await writeFile(file, ownText, "utf8");
    await renewNow();
    expect(planned).toHaveLength(3);
    await lock.release();
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("holdLock", () => {
  it("can be released twice", async () => {
    const file = await lockFile();
    const lock = await hold(file);

    await lock.release();
    const again = await hold(file);
    await lock.release();

    expect((await heldRecord(file)).pid).toBe(process.pid);
    await again.release();
  });

  it("fails when the lock's folder is missing", async () => {
    const file = join(await tempFolder(), "gone", "engine.lock");

    await expect(hold(file)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
