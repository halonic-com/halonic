import {
  assert,
  deepEqual,
  Emitter,
  err,
  fixedClock,
  fixedIds,
  mapResult,
  ok,
  randomIds,
  slugify,
  uniqueName,
} from "../src/index.ts";

/** Uses ids and a clock passed in, a result type, text helpers and the typed emitter. */
export function runExample(): {
  appId: string;
  testId: string;
  time: string;
  doubled: unknown;
  failed: unknown;
  names: string[];
  same: boolean;
  saved: string[];
} {
  // In an app: pass `(count) => crypto.getRandomValues(new Uint8Array(count))` and
  // `systemClock`. Here the bytes and the time are fixed, so the output is the same every run.
  const ids = randomIds((count) => new Uint8Array(count).fill(171), fixedClock());
  const appId = ids.next("run"); // "run_mjuohs00_abababab"

  // In a test: the same ids and times on every run.
  const testId = fixedIds().next("run"); // "run_1"
  const time = fixedClock().now().toISOString(); // "2026-01-01T00:00:00.000Z"

  assert(ok(1).ok, "ok() always succeeds");
  const doubled = mapResult(ok(21), (value) => value * 2); // { ok: true, value: 42 }
  const failed = mapResult(err("no file"), (value: number) => value * 2); // { ok: false, error: "no file" }

  // File-safe names from display names.
  const taken = ["weekly-report"];
  const names = [slugify("Weekly Report"), uniqueName("weekly-report", taken)]; // ["weekly-report", "weekly-report-2"]

  // Key order doesn't matter.
  const same = deepEqual({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }); // true

  // A typed event emitter: the payload type follows the event name.
  const changes = new Emitter<{ saved: { path: string } }>();
  const saved: string[] = [];
  const stop = changes.on("saved", ({ path }) => saved.push(path));
  changes.emit("saved", { path: "hubs/support/hub.yaml" });
  stop();
  changes.emit("saved", { path: "ignored.yaml" }); // nobody is listening any more

  return { appId, testId, time, doubled, failed, names, same, saved };
}
