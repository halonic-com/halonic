import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, rm, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { type RunLockRecord, runLockFormat, runLockStaleAfterMs } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { isStale, parseRecord, withRunLock } from "./run-lock.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

/**
 * Hooks into the lock's file calls, to play another writer at the moment
 * that matters. `beforeRename` and `beforeLink`: run once before the next
 * rename or link. `onWait`: runs instead of each wait for a held lock.
 * `failNextCreate`: the next exclusive create fails as if the file were there.
 */
const hooks = vi.hoisted(() => ({
  beforeRename: undefined as ((from: string) => Promise<void>) | undefined,
  beforeLink: undefined as ((to: string) => Promise<void>) | undefined,
  onWait: undefined as (() => Promise<void>) | undefined,
  failNextCreate: false,
  waits: 0,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    rename: async (from: string, to: string) => {
      const beforeRename = hooks.beforeRename;
      hooks.beforeRename = undefined;
      await beforeRename?.(from);
      return await fs.rename(from, to);
    },
    link: async (from: string, to: string) => {
      const beforeLink = hooks.beforeLink;
      hooks.beforeLink = undefined;
      await beforeLink?.(to);
      return await fs.link(from, to);
    },
    writeFile: (async (file: string, text: string, options: { flag?: string }) => {
      if (options?.flag === "wx" && hooks.failNextCreate) {
        hooks.failNextCreate = false;
        throw Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" });
      }
      return await fs.writeFile(file, text, options);
    }) as typeof fs.writeFile,
  };
});

vi.mock("node:timers/promises", () => ({
  setTimeout: async () => {
    hooks.waits += 1;
    await hooks.onWait?.();
  },
}));

afterAll(removeTempFolders);
afterEach(() => {
  hooks.beforeRename = undefined;
  hooks.beforeLink = undefined;
  hooks.onWait = undefined;
  hooks.failNextCreate = false;
  hooks.waits = 0;
});

const iso = (time: number) => new Date(time).toISOString();

/**
 * The lock files the Studio shell's Rust run lock judges too, so a CLI and
 * the desktop app agree on which locks are stale and on the record they
 * write. Its path is also a test input in this package's `turbo.json`, so a
 * change to it re-runs this test.
 */
const sharedCases = JSON.parse(
  readFileSync(
    new URL(
      "../../../../apps/studio/src-tauri/crates/run-lock/tests/fixtures/run-lock-cases.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  now: string;
  thisHost: string;
  runningPids: number[];
  record: RunLockRecord & { text: string };
  cases: { name: string; text: string; changedAt?: string; stale: boolean }[];
};

/** A lock record taken `ageMs` ago by `pid` on `host`. */
function record(pid: number, host = hostname(), ageMs = 0): RunLockRecord {
  return { version: runLockFormat, pid, host, takenAt: iso(Date.now() - ageMs) };
}

/** The id of a process that has exited, so no process with it runs. */
function exitedPid(): number {
  return spawnSync(process.execPath, ["--eval", ""]).pid;
}

/** A lock file path in a new folder, with `text` planted in it when given. */
async function lockFile(text?: string): Promise<string> {
  const file = join(await tempFolder(), "r1.lock");
  if (text !== undefined) {
    await writeFile(file, text, "utf8");
  }
  return file;
}

/** Waits until the lock is free: each wait for it removes it, after the first `held` waits. */
function freeLockAfter(file: string, held = 0): void {
  hooks.onWait = async () => {
    if (hooks.waits > held) {
      await rm(file, { force: true });
    }
  };
}

verifies("fs-node.run-store-lock", () => {
  it("waits while a live writer on this computer holds the lock", async () => {
    const file = await lockFile(JSON.stringify(record(process.pid)));
    freeLockAfter(file, 2);
    expect(await withRunLock(file, async () => "done")).toBe("done");
    expect(hooks.waits).toBe(3);
  });

  it("waits on a fresh lock from another computer, whose process it can't check", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid(), "another-computer")));
    freeLockAfter(file);
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(1);
  });

  it("removes a lock from another computer once it is too old", async () => {
    const old = record(process.pid, "another-computer", runLockStaleAfterMs + 60_000);
    const file = await lockFile(JSON.stringify(old));
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(0);
  });

  it("removes a lock taken too far in the future, from a clock that was off", async () => {
    const file = await lockFile(
      JSON.stringify(record(process.pid, hostname(), -runLockStaleAfterMs - 60_000)),
    );
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(0);
  });

  it("waits on a fresh lock whose record isn't valid, and removes it once it is too old", async () => {
    const file = await lockFile(JSON.stringify({ ...record(process.pid), pid: 0 }));
    hooks.onWait = async () => {
      const old = new Date(Date.now() - runLockStaleAfterMs - 60_000);
      await utimes(file, old, old);
    };
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(1);
  });

  it("puts back a lock another writer took while it was removing a stale one", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    const fresh = JSON.stringify(record(process.pid));
    hooks.beforeRename = async (from) => {
      // Another writer removed the stale lock and took its own after we read it.
      await rm(from);
      await writeFile(from, fresh, "utf8");
    };
    let heldDuringWait = "";
    hooks.onWait = async () => {
      heldDuringWait = await readFile(file, "utf8");
      await rm(file);
    };
    await withRunLock(file, async () => {});
    expect(heldDuringWait).toBe(fresh);
  });

  it("leaves a lock alone that a third writer took before it could put one back", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    const second = JSON.stringify(record(process.pid, "second-writer"));
    const third = JSON.stringify(record(process.pid, "third-writer"));
    hooks.beforeRename = async (from) => {
      await rm(from);
      await writeFile(from, second, "utf8");
    };
    hooks.beforeLink = async (to) => {
      await writeFile(to, third, "utf8");
    };
    let heldDuringWait = "";
    hooks.onWait = async () => {
      heldDuringWait = await readFile(file, "utf8");
      await rm(file);
    };
    await withRunLock(file, async () => {});
    expect(heldDuringWait).toBe(third);
  });

  it("takes the lock when another writer removed the stale one first", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    hooks.beforeRename = async (from) => {
      await rm(from);
    };
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(0);
  });

  it("tries again straight away when the lock is released between create and read", async () => {
    const file = await lockFile();
    hooks.failNextCreate = true;
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(0);
  });

  it("releases only its own lock, not one another writer took over", async () => {
    const file = await lockFile();
    const other = JSON.stringify(record(process.pid, "another-computer"));
    await withRunLock(file, async () => {
      await writeFile(file, other, "utf8");
    });
    expect(await readFile(file, "utf8")).toBe(other);
  });

  it.each(sharedCases.cases)("judges the shared case: $name", ({ text, changedAt, stale }) => {
    const found = {
      text,
      record: parseRecord(text),
      changedAt: Date.parse(changedAt ?? sharedCases.now),
    };
    const here = {
      host: sharedCases.thisHost,
      processRuns: (pid: number) => sharedCases.runningPids.includes(pid),
    };
    expect(isStale(found, Date.parse(sharedCases.now), here)).toBe(stale);
  });

  it("reads and writes the record exactly as the Rust run lock does", async () => {
    const { text, ...shared } = sharedCases.record;
    expect(parseRecord(text)).toEqual({ ...shared, version: runLockFormat });
    const file = await lockFile();
    const held = await withRunLock(file, async () => await readFile(file, "utf8"));
    expect(Object.keys(JSON.parse(held))).toEqual(Object.keys(JSON.parse(text)));
    expect(JSON.parse(held).takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("fails without running the work when the lock's folder is missing", async () => {
    const file = join(await tempFolder(), "missing", "r1.lock");
    const work = vi.fn(async () => {});
    await expect(withRunLock(file, work)).rejects.toThrow("ENOENT");
    expect(work).not.toHaveBeenCalled();
  });
});
