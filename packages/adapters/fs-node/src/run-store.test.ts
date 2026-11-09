import { spawnSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import type { RunEvent } from "@halonicjs/events";
import { type RunLockRecord, runLockFormat, runLockStaleAfterMs } from "@halonicjs/ports";
import { runStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { FolderRunStore } from "./run-store.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

const failingWrite = vi.hoisted(() => ({
  /** When set, the next log write gets only this many bytes out, then fails as a full disk would. */
  bytesOut: undefined as number | undefined,
  /** When set, the failing write waits for this once its bytes are out, before it fails. */
  hold: undefined as Promise<void> | undefined,
  /** Called once the failing write's bytes are out. */
  onBytesOut: undefined as (() => void) | undefined,
  /** When set, runs before the next log write, while the store holds the run's lock. */
  onWrite: undefined as (() => Promise<void>) | undefined,
}));

/** How many times a run log has been read whole. */
const logReads = vi.hoisted(() => ({ count: 0 }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    readFile: (async (file: string, ...rest: []) => {
      if (String(file).endsWith(".jsonl")) {
        logReads.count += 1;
      }
      return await fs.readFile(file, ...rest);
    }) as typeof fs.readFile,
    appendFile: async (file: string, text: string, encoding: BufferEncoding) => {
      await failingWrite.onWrite?.();
      failingWrite.onWrite = undefined;
      const bytesOut = failingWrite.bytesOut;
      if (bytesOut === undefined) {
        return await fs.appendFile(file, text, encoding);
      }
      failingWrite.bytesOut = undefined;
      await fs.appendFile(file, Buffer.from(text, encoding).subarray(0, bytesOut));
      failingWrite.onBytesOut?.();
      await failingWrite.hold;
      throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
    },
  };
});

afterAll(removeTempFolders);
afterEach(() => {
  failingWrite.bytesOut = undefined;
  failingWrite.hold = undefined;
  failingWrite.onBytesOut = undefined;
  failingWrite.onWrite = undefined;
});

runStoreContract("folder", async () => new FolderRunStore(await tempFolder()), {
  makeShared: async () => {
    const root = await tempFolder();
    return {
      open: () => new FolderRunStore(root),
      plantStaleLock: (runId, why) => plantLock(root, runId, staleLock(why)),
    };
  },
});

/** A lock record a crashed writer could have left: from a process that has exited, or too old. */
function staleLock(why: "process-gone" | "too-old"): RunLockRecord {
  const now = Date.now();
  if (why === "process-gone") {
    const exited = spawnSync(process.execPath, ["--eval", ""]);
    return { version: runLockFormat, pid: exited.pid, host: hostname(), takenAt: iso(now) };
  }
  const takenAt = iso(now - runLockStaleAfterMs - 60_000);
  return { version: runLockFormat, pid: process.pid, host: hostname(), takenAt };
}

async function plantLock(root: string, runId: string, lock: RunLockRecord | string): Promise<void> {
  const text = typeof lock === "string" ? lock : JSON.stringify(lock);
  await writeFile(join(root, `${runId}.lock`), text, "utf8");
}

const iso = (time: number) => new Date(time).toISOString();

function started(runId: string): RunEvent {
  return {
    runId,
    seq: 1,
    at: "2026-01-01T00:00:01.000Z",
    type: "run.started",
    hubId: "hub",
    workflowId: "flow",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
}

function entered(runId: string, seq: number): RunEvent {
  return { runId, seq, at: "2026-01-01T00:00:02.000Z", type: "state.entered", state: `s${seq}` };
}

/** A store in a new folder that already holds run `r1` with three events. */
async function storeWithRun(): Promise<{ root: string; store: FolderRunStore }> {
  const root = await tempFolder();
  const store = new FolderRunStore(root);
  await store.append("r1", 0, [started("r1"), entered("r1", 2), entered("r1", 3)]);
  return { root, store };
}

const seqs = (events: RunEvent[]) => events.map((event) => event.seq);

verifies("fs-node.run-store-files", () => {
  it("keeps one log per run, one event per line, and the snapshot beside it", async () => {
    const { root, store } = await storeWithRun();
    await store.append("r1", 3, [entered("r1", 4)], { snapshot: { step: 4 } });
    const lines = (await readFile(join(root, "r1.jsonl"), "utf8")).split("\n");
    expect(lines.map((line) => (line === "" ? null : JSON.parse(line).seq))).toEqual([
      1,
      2,
      3,
      4,
      null,
    ]);
    expect(JSON.parse(await readFile(join(root, "r1.snapshot.json"), "utf8"))).toEqual({
      seq: 4,
      state: { step: 4 },
    });
  });

  it("forgets a run whose log is deleted, and lists nothing for a missing folder", async () => {
    const { root, store } = await storeWithRun();
    await store.append("r2", 0, [started("r2")], { snapshot: { step: 1 } });
    await rm(join(root, "r2.jsonl"));
    expect((await store.list()).map((run) => run.id)).toEqual(["r1"]);
    expect(await store.get("r2")).toBeNull();
    expect(await store.snapshot("r2")).toBeNull();
    // A new run with the same id doesn't inherit the old snapshot.
    await store.append("r2", 0, [started("r2")]);
    expect(await store.snapshot("r2")).toBeNull();
    expect(await new FolderRunStore(join(root, "missing")).list()).toEqual([]);
  });

  it("keeps the order of appends to one run made one after another without waiting", async () => {
    const { store } = await storeWithRun();
    const results = await Promise.all([
      store.append("r1", 3, [entered("r1", 4)]),
      store.append("r1", 4, [entered("r1", 5)]),
      store.append("r1", 5, [entered("r1", 6)]),
    ]);
    expect(results).toEqual([
      { ok: true, lastSeq: 4 },
      { ok: true, lastSeq: 5 },
      { ok: true, lastSeq: 6 },
    ]);
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("reads a log whole once, not again on every append to it", async () => {
    const { store } = await storeWithRun();
    const readsBefore = logReads.count;
    for (let seq = 4; seq <= 8; seq += 1) {
      await store.append("r1", seq - 1, [entered("r1", seq)]);
    }
    expect(logReads.count - readsBefore).toBe(0);
    expect(await store.append("r1", 3, [entered("r1", 4)])).toEqual({
      ok: false,
      reason: "conflict",
      lastSeq: 8,
    });
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("reads a log again when something else changed its size", async () => {
    const { root, store } = await storeWithRun();
    const log = join(root, "r1.jsonl");
    await writeFile(log, `${JSON.stringify(entered("r1", 4))}\n`, { flag: "a" });
    expect(await store.append("r1", 3, [entered("r1", 4)])).toEqual({
      ok: false,
      reason: "conflict",
      lastSeq: 4,
    });
    expect(await store.append("r1", 4, [entered("r1", 5)])).toEqual({ ok: true, lastSeq: 5 });
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3, 4, 5]);
  });

  it("makes a reader wait for an append to the same run to finish", async () => {
    const { store } = await storeWithRun();
    const batch = [entered("r1", 4), entered("r1", 5)];
    let release = () => {};
    failingWrite.hold = new Promise((resolve) => {
      release = resolve;
    });
    const bytesOut = new Promise<void>((resolve) => {
      failingWrite.onBytesOut = resolve;
    });
    // The first new line is whole in the log before the write fails.
    failingWrite.bytesOut = JSON.stringify(batch[0]).length + 1;
    const appending = store.append("r1", 3, batch);
    await bytesOut;
    const reads = Promise.all([store.events("r1"), store.list(), store.snapshot("r1")]);
    // Gives a reader that doesn't wait time to see the line that is about to be cut back.
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await expect(appending).rejects.toThrow("ENOSPC");
    const [events, runs] = await reads;
    expect(seqs(events)).toEqual([1, 2, 3]);
    expect(runs.map((run) => run.lastSeq)).toEqual([3]);
  });

  it("refuses an unsafe run id in every method, and leaves other files out of the list", async () => {
    const { root, store } = await storeWithRun();
    const unsafe = [
      "",
      "..",
      "../r1",
      "a/b",
      "a\\b",
      "/r1",
      ".r1",
      "NUL",
      "con.1",
      "x".repeat(129),
    ];
    for (const runId of unsafe) {
      await expect(store.append(runId, 0, [started(runId)]), runId).rejects.toThrow(RangeError);
      await expect(store.events(runId), runId).rejects.toThrow(RangeError);
      await expect(store.snapshot(runId), runId).rejects.toThrow(RangeError);
      await expect(store.get(runId), runId).rejects.toThrow(RangeError);
    }
    await writeFile(join(root, ".hidden.jsonl"), "");
    await writeFile(join(root, "notes.txt"), "");
    expect((await store.list()).map((run) => run.id)).toEqual(["r1"]);
  });
});

verifies("fs-node.run-store-recovery", () => {
  it("skips a torn last line, and cuts it off before the next append", async () => {
    const { root, store } = await storeWithRun();
    const log = join(root, "r1.jsonl");
    await writeFile(log, `${JSON.stringify(entered("r1", 4)).slice(0, 20)}`, { flag: "a" });
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3]);
    expect((await store.get("r1"))?.lastSeq).toBe(3);
    expect(await store.append("r1", 3, [entered("r1", 4)])).toEqual({ ok: true, lastSeq: 4 });
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3, 4]);
    expect((await readFile(log, "utf8")).endsWith(`${JSON.stringify(entered("r1", 4))}\n`)).toBe(
      true,
    );
  });

  it("counts a last line without its line break as torn, even when it is whole", async () => {
    const { root, store } = await storeWithRun();
    await writeFile(join(root, "r1.jsonl"), JSON.stringify(entered("r1", 4)), { flag: "a" });
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3]);
  });

  it("stores none of an append's events when the write fails part-way", async () => {
    const { root, store } = await storeWithRun();
    const log = join(root, "r1.jsonl");
    const before = await readFile(log, "utf8");
    const batch = [entered("r1", 4), entered("r1", 5), entered("r1", 6)];
    // The first new line and part of the second get out before the disk is full.
    failingWrite.bytesOut = JSON.stringify(batch[0]).length + 10;
    await expect(store.append("r1", 3, batch)).rejects.toThrow("ENOSPC");
    expect(await readFile(log, "utf8")).toBe(before);
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3]);
    expect(await store.append("r1", 3, batch)).toEqual({ ok: true, lastSeq: 6 });
    expect(await store.append("r1", 6, [entered("r1", 7)])).toEqual({ ok: true, lastSeq: 7 });
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stores nothing for a new run whose first write fails part-way", async () => {
    const root = await tempFolder();
    const store = new FolderRunStore(root);
    failingWrite.bytesOut = JSON.stringify(started("r1")).length + 1;
    await expect(store.append("r1", 0, [started("r1"), entered("r1", 2)])).rejects.toThrow(
      "ENOSPC",
    );
    expect(await store.events("r1")).toEqual([]);
    expect(await store.list()).toEqual([]);
  });

  it("fails on a broken line in the middle of a log, naming the file and line", async () => {
    const { root, store } = await storeWithRun();
    const log = join(root, "r1.jsonl");
    const lines = (await readFile(log, "utf8")).split("\n");
    await writeFile(log, [lines[0], "{not json", lines[2], ""].join("\n"));
    await expect(store.events("r1")).rejects.toThrow("Broken run log r1.jsonl, line 2");
    await writeFile(log, [lines[0], lines[2], ""].join("\n"));
    await expect(store.events("r1")).rejects.toThrow("line 2: it holds event 3 of run r1");
  });

  it("fails on a log that isn't UTF-8, naming the file", async () => {
    const { root, store } = await storeWithRun();
    await writeFile(join(root, "r1.jsonl"), Buffer.from([0xff, 0x0a]), { flag: "a" });
    await expect(store.events("r1")).rejects.toThrow(
      "Broken run log r1.jsonl: it is not valid UTF-8",
    );
  });

  it("gives a stale snapshot, so the engine replays the events after it", async () => {
    const { store } = await storeWithRun();
    await store.append("r1", 3, [entered("r1", 4)], { snapshot: { step: 4 } });
    await store.append("r1", 4, [entered("r1", 5), entered("r1", 6)]);
    const snapshot = await store.snapshot("r1");
    expect(snapshot).toEqual({ seq: 4, state: { step: 4 } });
    expect(seqs(await store.events("r1", snapshot?.seq))).toEqual([5, 6]);
  });

  it("gives no snapshot when it is missing, unreadable or ahead of the log", async () => {
    const { root, store } = await storeWithRun();
    const file = join(root, "r1.snapshot.json");
    expect(await store.snapshot("r1")).toBeNull();
    for (const text of [
      "{torn",
      "[]",
      '{"seq":0,"state":{}}',
      '{"seq":2}',
      '{"seq":4,"state":{}}',
    ]) {
      await writeFile(file, text);
      expect(await store.snapshot("r1"), text).toBeNull();
    }
    await writeFile(file, '{"seq":3,"state":null}');
    expect(await store.snapshot("r1")).toEqual({ seq: 3, state: null });
  });

  it("still stores the events when the snapshot can't be written, and reports it", async () => {
    const root = await tempFolder();
    const failures: [string, unknown][] = [];
    const store = new FolderRunStore(root, {
      onSnapshotError: (runId, error) => failures.push([runId, error]),
    });
    await store.append("r1", 0, [started("r1"), entered("r1", 2), entered("r1", 3)]);
    await mkdir(join(root, "r1.snapshot.json"));
    const result = await store.append("r1", 3, [entered("r1", 4)], { snapshot: { step: 4 } });
    expect(result).toEqual({ ok: true, lastSeq: 4 });
    expect(failures).toEqual([["r1", expect.any(Error)]]);
    expect(seqs(await store.events("r1"))).toEqual([1, 2, 3, 4]);
    expect(await store.snapshot("r1")).toBeNull();
  });
});

verifies("fs-node.run-store-lock", () => {
  it("waits on a lock file without a record until it is too old", async () => {
    const { root, store } = await storeWithRun();
    // A writer that crashed between creating its lock and writing the record.
    await plantLock(root, "r1", "");
    const lock = join(root, "r1.lock");
    const old = new Date(Date.now() - runLockStaleAfterMs - 60_000);
    await utimes(lock, old, old);
    expect(await store.append("r1", 3, [entered("r1", 4)])).toEqual({ ok: true, lastSeq: 4 });
  });

  it("leaves no lock behind after an append, a conflict or a failed write", async () => {
    const { root, store } = await storeWithRun();
    await store.append("r1", 3, [entered("r1", 4)]);
    await store.append("r1", 1, [entered("r1", 2)]);
    failingWrite.bytesOut = 5;
    await expect(store.append("r1", 4, [entered("r1", 5)])).rejects.toThrow("ENOSPC");
    expect((await readdir(root)).sort()).toEqual(["r1.jsonl"]);
  });

  it("keeps the record of the lock it writes to the port's format", async () => {
    const { root, store } = await storeWithRun();
    let seen: unknown;
    failingWrite.onWrite = async () => {
      seen = JSON.parse(await readFile(join(root, "r1.lock"), "utf8"));
    };
    await store.append("r1", 3, [entered("r1", 4)]);
    expect(seen).toEqual({
      version: runLockFormat,
      pid: process.pid,
      host: hostname(),
      takenAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u),
    });
  });
});
