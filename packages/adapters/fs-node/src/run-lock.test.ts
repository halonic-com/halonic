import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import {
  type RunLockRecord,
  runLockFormat,
  runLockStaleAfterMs,
  runLockTakeoverStaleAfterMs,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { BusySystem } from "./busy-retry.ts";
import { isStale, parseRecord, settleUnderRunLock, withRunLock } from "./run-lock.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

/** The lock's file calls a test can make fail as busy. */
type BusyCall = "create" | "readFile" | "rm";

/**
 * Hooks into the lock's file calls, to play another writer at the moment
 * that matters. `afterRead`: runs once after the next read, before its text
 * is given back. `onWait`: runs instead of each wait for a held lock.
 * `failNextCreate`: the next exclusive create fails as if the file were there.
 * `busy`: per call (`create`, `readFile`, `rm`), the error codes
 * its next calls fail with in turn, as Windows fails them while another
 * writer deletes or holds the file.
 */
const hooks = vi.hoisted(() => ({
  afterRead: undefined as (() => Promise<void>) | undefined,
  onWait: undefined as (() => Promise<void>) | undefined,
  failNextCreate: false,
  waits: 0,
  busy: {} as Partial<Record<BusyCall, string[]>>,
  /** Throws the next code planted for `call` in `busy`, if any. */
  throwIfBusy(call: BusyCall): void {
    const code = hooks.busy[call]?.shift();
    if (code !== undefined) {
      throw Object.assign(new Error(`${code}: operation not permitted, ${call}`), { code });
    }
  },
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...fs,
    writeFile: (async (file: string, text: string, options: { flag?: string }) => {
      if (options?.flag === "wx") {
        hooks.throwIfBusy("create");
        if (hooks.failNextCreate) {
          hooks.failNextCreate = false;
          throw Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" });
        }
      }
      return await fs.writeFile(file, text, options);
    }) as typeof fs.writeFile,
    readFile: (async (...args: Parameters<typeof fs.readFile>) => {
      hooks.throwIfBusy("readFile");
      const text = await fs.readFile(...args);
      const afterRead = hooks.afterRead;
      hooks.afterRead = undefined;
      await afterRead?.();
      return text;
    }) as typeof fs.readFile,
    rm: async (...args: Parameters<typeof fs.rm>) => {
      hooks.throwIfBusy("rm");
      return await fs.rm(...args);
    },
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
  hooks.afterRead = undefined;
  hooks.onWait = undefined;
  hooks.failNextCreate = false;
  hooks.waits = 0;
  hooks.busy = {};
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
  staleAfterMs: number;
  takeoverStaleAfterMs: number;
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

/**
 * A system on `platform` for the lock's busy retries, whose clock moves on
 * only when it waits. Counts its waits apart from the waits for a held lock.
 */
function busySystem(platform: string): BusySystem & { busyWaits: number } {
  let clock = 0;
  const system = {
    platform,
    busyWaits: 0,
    now: () => clock,
    async wait(ms: number) {
      system.busyWaits += 1;
      clock += ms;
    },
  };
  return system;
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

  it("removes a stale lock and its takeover file, and leaves only its own lock", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    const folder = await withRunLock(file, async () => await readdir(join(file, "..")));
    expect(folder).toEqual(["r1.lock"]);
    expect(await readdir(join(file, ".."))).toEqual([]);
  });

  it("leaves a lock alone that another writer took after it read the stale one", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    const fresh = JSON.stringify(record(process.pid, "another-writer"));
    hooks.afterRead = async () => {
      // Another writer removes the stale lock and takes its own before we act on it.
      await rm(file);
      await writeFile(file, fresh, "utf8");
    };
    let heldDuringWait = "";
    hooks.onWait = async () => {
      heldDuringWait = await readFile(file, "utf8");
      await rm(file);
    };
    await withRunLock(file, async () => {});
    expect(heldDuringWait).toBe(fresh);
  });

  it("waits while another writer is removing the stale lock", async () => {
    const stale = JSON.stringify(record(exitedPid()));
    const file = await lockFile(stale);
    await writeFile(`${file}.takeover`, JSON.stringify(record(process.pid)), "utf8");
    let heldDuringWait = "";
    hooks.onWait = async () => {
      heldDuringWait = await readFile(file, "utf8");
      await rm(`${file}.takeover`);
    };
    await withRunLock(file, async () => {});
    expect(heldDuringWait).toBe(stale);
    expect(hooks.waits).toBe(1);
  });

  it("removes a takeover file left by a writer that crashed while removing", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    const takeover = `${file}.takeover`;
    await writeFile(takeover, JSON.stringify(record(exitedPid())), "utf8");
    const old = new Date(Date.now() - runLockTakeoverStaleAfterMs - 1_000);
    await utimes(takeover, old, old);
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(1);
    expect(await readdir(join(file, ".."))).toEqual([]);
  });

  it("lets only one of three writers hold the lock after a stale one is removed", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    let inside = 0;
    let mostInside = 0;
    const work = async (until?: Promise<void>) => {
      inside += 1;
      mostInside = Math.max(mostInside, inside);
      await until;
      await new Promise(setImmediate);
      inside -= 1;
    };
    let letFirstLeave = () => {};
    const firstMayLeave = new Promise<void>((resolve) => {
      letFirstLeave = resolve;
    });
    const others: Promise<void>[] = [];
    hooks.afterRead = async () => {
      // The second writer has read the stale lock. Before it acts on it, the
      // first removes it and takes its own, and a third starts to wait.
      others.push(withRunLock(file, async () => await work(firstMayLeave)));
      while (inside === 0) {
        await new Promise(setImmediate);
      }
      others.push(withRunLock(file, async () => await work()));
    };
    hooks.onWait = async () => {
      if (hooks.waits >= 3) {
        letFirstLeave();
      }
      await new Promise(setImmediate);
    };
    await withRunLock(file, async () => await work());
    await Promise.all(others);
    expect(others).toHaveLength(2);
    expect(mostInside).toBe(1);
  });

  it("takes the lock when another writer removed the stale one first", async () => {
    const file = await lockFile(JSON.stringify(record(exitedPid())));
    hooks.afterRead = async () => {
      await rm(file);
    };
    await withRunLock(file, async () => {});
    expect(hooks.waits).toBe(0);
  });

  it.skipIf(process.platform === "win32")(
    "[platform:win32] needs POSIX links, modes and signals: fails instead of trying for ever when the lock is a link to a missing file",
    async () => {
      const file = await lockFile();
      await symlink(join(file, "..", "missing"), file);
      const work = vi.fn(async () => {});
      await expect(withRunLock(file, work)).rejects.toThrow("is a link to a file that isn't there");
      expect(work).not.toHaveBeenCalled();
    },
  );

  it.skipIf(process.platform === "win32")(
    "[platform:win32] needs POSIX links, modes and signals: fails instead of trying for ever when the takeover file is a link to a missing file",
    async () => {
      const file = await lockFile(JSON.stringify(record(exitedPid())));
      await symlink(join(file, "..", "missing"), `${file}.takeover`);
      await expect(withRunLock(file, async () => {})).rejects.toThrow("r1.lock.takeover is a link");
    },
  );

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

  it("uses the same stale limits as the Rust run lock", () => {
    expect(runLockStaleAfterMs).toBe(sharedCases.staleAfterMs);
    expect(runLockTakeoverStaleAfterMs).toBe(sharedCases.takeoverStaleAfterMs);
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

  describe("on Windows, while another writer deletes or holds the lock file", () => {
    it("tries the create again while Windows denies access to a delete-pending lock", async () => {
      const file = await lockFile();
      hooks.busy.create = ["EPERM", "EPERM"];
      const windows = busySystem("win32");
      expect(await withRunLock(file, async () => "done", windows)).toBe("done");
      expect(windows.busyWaits).toBe(2);
      expect(hooks.waits).toBe(0);
    });

    it("tries the read again while another program has the lock open", async () => {
      const file = await lockFile(JSON.stringify(record(process.pid)));
      hooks.busy.readFile = ["EBUSY"];
      freeLockAfter(file);
      const windows = busySystem("win32");
      await withRunLock(file, async () => {}, windows);
      expect(windows.busyWaits).toBe(1);
    });

    it("tries removing a stale lock again while Windows refuses it", async () => {
      const file = await lockFile(JSON.stringify(record(exitedPid())));
      hooks.busy.rm = ["EPERM"];
      const windows = busySystem("win32");
      await withRunLock(file, async () => {}, windows);
      expect(windows.busyWaits).toBe(1);
      expect(hooks.waits).toBe(0);
    });

    it("tries the release again, so the lock isn't left behind", async () => {
      const file = await lockFile();
      const windows = busySystem("win32");
      await withRunLock(
        file,
        async () => {
          hooks.busy.rm = ["EPERM", "EBUSY"];
        },
        windows,
      );
      expect(windows.busyWaits).toBe(2);
      await expect(readFile(file, "utf8")).rejects.toThrow("ENOENT");
    });

    it("fails without running the work once the lock stays refused past the limit", async () => {
      const file = await lockFile();
      hooks.busy.create = Array(1_000).fill("EPERM");
      const work = vi.fn(async () => {});
      await expect(withRunLock(file, work, busySystem("win32"))).rejects.toThrow("EPERM");
      expect(work).not.toHaveBeenCalled();
    });

    it("fails at once off Windows, where EPERM is a real refusal", async () => {
      const file = await lockFile();
      hooks.busy.create = ["EPERM"];
      const linux = busySystem("linux");
      const work = vi.fn(async () => {});
      await expect(withRunLock(file, work, linux)).rejects.toThrow("EPERM");
      expect(linux.busyWaits).toBe(0);
      expect(work).not.toHaveBeenCalled();
    });
  });

  it("fails without running the work when the lock's folder is missing", async () => {
    const file = join(await tempFolder(), "missing", "r1.lock");
    const work = vi.fn(async () => {});
    await expect(withRunLock(file, work)).rejects.toThrow("ENOENT");
    expect(work).not.toHaveBeenCalled();
  });

  describe("when the lock can't be removed after the work", () => {
    it("keeps the work's result, with the release error", async () => {
      const file = await lockFile();
      const outcome = await settleUnderRunLock(file, async () => {
        hooks.busy.rm = ["EACCES"];
        return "done";
      });
      expect(outcome).toEqual({
        result: "done",
        released: false,
        releaseError: expect.objectContaining({ code: "EACCES" }),
      });
    });

    it("fails with the release error when only the result is wanted", async () => {
      const file = await lockFile();
      const work = async () => {
        hooks.busy.rm = ["EACCES"];
        return "done";
      };
      await expect(withRunLock(file, work)).rejects.toThrow("EACCES");
    });
  });

  describe("when the work fails", () => {
    it("releases the lock and passes the work's error on", async () => {
      const file = await lockFile();
      const work = async () => {
        throw new Error("work failed");
      };
      await expect(settleUnderRunLock(file, work)).rejects.toThrow("work failed");
      await expect(readFile(file, "utf8")).rejects.toThrow("ENOENT");
    });

    it("passes the work's error on when the lock can't be removed either", async () => {
      const file = await lockFile();
      const work = async () => {
        hooks.busy.rm = ["EACCES"];
        throw new Error("work failed");
      };
      await expect(settleUnderRunLock(file, work)).rejects.toThrow("work failed");
    });
  });
});
