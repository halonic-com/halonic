import { beforeAll, it, type TestFunction } from "vitest";
import type { MakeToolScriptIsolate } from "./harness.ts";

/** What one suite leaves out: the reason for each title, and the titles a case had. */
interface LeftOut {
  readonly reasons: ReadonlyMap<string, string>;
  readonly named: Set<string>;
}

/** Each suite's left-out cases, by the `make` it was given, which is its own. */
const leftOutBySuite = new WeakMap<MakeToolScriptIsolate, LeftOut>();

/**
 * Registers the fence cases of the suite for `make`, as Vitest's `it` does,
 * except those that suite leaves out. A left-out case isn't registered at
 * all rather than skipped, because a skipped test fails the run; its title
 * and reason stay in the isolate's own test, where a reviewer reads them.
 */
export function fenceIt(make: MakeToolScriptIsolate): (title: string, body: TestFunction) => void {
  return (title, body) => {
    if (!leavesOut(make, title)) it(title, body);
  };
}

/**
 * Whether the suite for `make` leaves out the case or group named `title`.
 * A group whose cases would all be left out is left out whole by its
 * requirement id, since Vitest refuses a group with no cases.
 */
export function leavesOut(make: MakeToolScriptIsolate, title: string): boolean {
  const leftOut = leftOutBySuite.get(make);
  if (!leftOut?.reasons.has(title)) return false;
  leftOut.named.add(title);
  return true;
}

/**
 * Makes the suite for `make` leave out the cases `leaveOut` names. Call it
 * in the suite's `describe`, before its cases.
 *
 * @throws Error when a reason is empty; the suite's cases fail when a title
 *   names no case, so a renamed case can't stay left out unseen
 */
export function leavingOut(
  make: MakeToolScriptIsolate,
  leaveOut: Readonly<Record<string, string>>,
): void {
  const empty = Object.entries(leaveOut).filter(([, reason]) => reason.trim() === "");
  if (empty.length > 0) {
    throw new Error(
      `Say why each fence case is left out: ${empty.map(([title]) => title).join(", ")}.`,
    );
  }
  const leftOut: LeftOut = { reasons: new Map(Object.entries(leaveOut)), named: new Set() };
  leftOutBySuite.set(make, leftOut);
  // Vitest registers nested cases after this `describe`'s body returns, and before any hook runs.
  beforeAll(() => {
    const unknown = [...leftOut.reasons.keys()].filter((title) => !leftOut.named.has(title));
    if (unknown.length > 0) {
      throw new Error(`No fence case has these titles: ${unknown.join(", ")}.`);
    }
  });
}
