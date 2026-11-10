// The attack tests of HAL-4045 for `holdLock`: a symlink planted where the
// lock goes never lets the lock write to or remove the file it points at,
// and of several processes started at once on a free or a stale lock, only
// one holds it at a time. The dangling symlink has its test in run-lock.test.ts.

import { spawn } from "node:child_process";
import { lstat, readFile, rename, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { holdLock } from "./held-lock.ts";
import { removeTempFolders, tempFolder } from "./temp-folder.test-helper.ts";

afterAll(removeTempFolders);

const quiet = { onLost: () => {}, onRenewError: () => {}, setTimer: () => () => {} };

/** A file someone cares about, last changed long ago so a lock on it counts as stale. */
async function victim(folder: string): Promise<string> {
  const file = join(folder, "settings.json");
  await writeFile(file, "precious", "utf8");
  await utimes(file, new Date(0), new Date(0));
  return file;
}

/**
 * Starts `count` processes that each try `holdLock` on `file` at the same
 * moment, hold it for `holdMs` and release it, and gives what each said:
 * `held <from> <to>` or the error's name.
 */
async function race(file: string, count: number, holdMs: number): Promise<string[]> {
  const script = join(await tempFolder(), "contender.mjs");
  const heldLock = pathToFileURL(join(import.meta.dirname, "held-lock.ts")).href;
  await writeFile(
    script,
    [
      `import { holdLock } from ${JSON.stringify(heldLock)};`,
      "const [file, start] = process.argv.slice(2);",
      "while (Date.now() < Number(start)) {}",
      "try {",
      "  const lock = await holdLock(file, { onLost() {}, onRenewError() {} });",
      "  const from = Date.now();",
      `  await new Promise((done) => setTimeout(done, ${holdMs}));`,
      "  process.stdout.write(`held ${from} ${Date.now()}`);",
      "  await lock.release();",
      "} catch (error) {",
      "  process.stdout.write(error.name);",
      "}",
    ].join("\n"),
    "utf8",
  );
  const start = String(Date.now() + 1_000);
  return Promise.all(
    Array.from(
      { length: count },
      () =>
        new Promise<string>((resolve, reject) => {
          const child = spawn(process.execPath, [script, file, start]);
          let said = "";
          child.stdout.on("data", (chunk) => {
            said += chunk;
          });
          child.on("error", reject);
          child.on("close", () => resolve(said));
        }),
    ),
  );
}

/** Checks that no two `held <from> <to>` lines overlap in time, and gives how many there were. */
function expectNoOverlap(said: string[]): number {
  const held = said
    .filter((line) => line.startsWith("held"))
    .map((line) => line.split(" ").slice(1).map(Number) as [number, number])
    .sort(([a], [b]) => a - b);
  held.slice(1).forEach(([from], i) => {
    expect(from, JSON.stringify(held)).toBeGreaterThanOrEqual(held[i]?.[1] ?? 0);
  });
  return held.length;
}

describe("holdLock under attack", () => {
  it("takes over a stale symlink without writing to or removing the file it points at", async () => {
    const folder = await tempFolder();
    const target = await victim(folder);
    const file = join(folder, "engine.lock");
    await symlink(target, file);

    const lock = await holdLock(file, quiet);

    expect((await lstat(file)).isSymbolicLink()).toBe(false);
    expect(JSON.parse(await readFile(file, "utf8")).pid).toBe(process.pid);
    await lock.release();
    expect(await readFile(target, "utf8")).toBe("precious");
  });

  it("refuses a fresh symlink as a lock held by another process, leaving its file alone", async () => {
    const folder = await tempFolder();
    const target = join(folder, "settings.json");
    await writeFile(target, "precious", "utf8");
    const file = join(folder, "engine.lock");
    await symlink(target, file);

    await expect(holdLock(file, quiet)).rejects.toMatchObject({ name: "LockHeldError" });

    expect(await readFile(target, "utf8")).toBe("precious");
  });

  it("removes only a symlink planted over its own lock on release, not the file it points at", async () => {
    const folder = await tempFolder();
    const file = join(folder, "engine.lock");
    const lock = await holdLock(file, quiet);
    // The planted file holds a copy of the lock's text, so release takes it for its own.
    const copy = join(folder, "copy.json");
    await writeFile(copy, await readFile(file, "utf8"), "utf8");
    await symlink(copy, `${file}.planted`);
    await rename(`${file}.planted`, file);

    await lock.release();

    await expect(lstat(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(copy, "utf8")).pid).toBe(process.pid);
  });

  // A process the runner starts late can take the lock after the first one let
  // it go, so this checks that no two hold it at once, not that only one ever does.
  it("of six processes started at once on a free lock, never lets two hold it at the same time", async () => {
    const file = join(await tempFolder(), "engine.lock");

    const said = await race(file, 6, 300);

    const held = expectNoOverlap(said);
    expect(held).toBeGreaterThanOrEqual(1);
    expect(said.filter((line) => line === "LockHeldError")).toHaveLength(6 - held);
    await expect(lstat(file)).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("of twelve processes started at once on a stale lock, never lets two hold it at the same time", async () => {
    const file = join(await tempFolder(), "engine.lock");
    await writeFile(
      file,
      JSON.stringify({ pid: 1, host: "gone", takenAt: new Date(0).toISOString() }),
      "utf8",
    );
    await utimes(file, new Date(0), new Date(0));

    const said = await race(file, 12, 300);

    expect(expectNoOverlap(said)).toBeGreaterThanOrEqual(1);
    await expect(lstat(file)).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);
});
