import { ManualClock, MemoryRecordStore } from "@halonicjs/adapter-memory";
import { NodeCoordination, randomLeaseToken } from "../src/index.ts";

/** Takes a lease, sets a value, counts against a limit, then restarts on the same store. */
export async function runExample(): Promise<{
  firstLease: boolean;
  secondLease: boolean;
  valueSet: boolean;
  valueSetAgain: boolean;
  counts: number[];
  counterRefused: boolean;
  windowAllowed: boolean[];
  leaseHeldAfterRestart: boolean;
  counterAfterRestart: number;
}> {
  // The store keeps the state; the clock is passed in, so the example moves time by hand.
  const store = new MemoryRecordStore();
  const clock = new ManualClock("2026-11-09T07:00:00.000Z");
  const options = { store, clock, newToken: randomLeaseToken };
  const coordination = new NodeCoordination(options);

  // A lease is held until it is released or its time runs out.
  const lease = await coordination.tryAcquire("routine:daily", 30_000);
  const secondLease = await coordination.tryAcquire("routine:daily", 30_000); // null: still held
  const firstLease = lease !== null;

  // A value changes only when it is what the caller expects: null means "not set yet".
  const valueSet = await coordination.compareAndSet("run:1:state", null, "waiting"); // true
  const valueSetAgain = await coordination.compareAndSet("run:1:state", null, "done"); // false

  // A counter adds `by` unless that would go above the limit.
  const counts: number[] = [];
  for (let i = 0; i < 3; i++) {
    counts.push((await coordination.increment("budget", 2, 5)).value); // 2, 4, then 4 again
  }
  const counterRefused = !(await coordination.increment("budget", 2, 5)).applied; // true

  // A window allows `limit` attempts, then refuses until the window ends.
  const windowAllowed: boolean[] = [];
  for (let i = 0; i < 3; i++) {
    windowAllowed.push((await coordination.countInWindow("login:ada", 60_000, 2)).allowed); // true, true, false
  }

  // After a restart, a new instance on the same store still sees the lease and the counter.
  const restarted = new NodeCoordination(options);
  const leaseHeldAfterRestart = (await restarted.tryAcquire("routine:daily", 30_000)) === null; // true
  const counterAfterRestart = (await restarted.increment("budget", 1, 5)).value; // 5

  if (lease !== null) {
    await restarted.release(lease);
  }
  return {
    firstLease,
    secondLease: secondLease !== null,
    valueSet,
    valueSetAgain,
    counts,
    counterRefused,
    windowAllowed,
    leaseHeldAfterRestart,
    counterAfterRestart,
  };
}
