import assert from "node:assert/strict";
import { type ShadowRunner, shadowDigest } from "@halonicjs/auto-approvals";
import { company } from "./acme-data.test-helper.ts";
import type { FakePaperclip } from "./fake-paperclip.test-helper.ts";
import { matchesRequest } from "./requests.ts";
import { shadowRequestNames } from "./shadow-fetch.ts";
import {
  b0,
  canaryKey,
  cardReasons,
  hour,
  type MemoryLedgerStore,
  runnerFor,
  runReasons,
  t0,
  type World,
} from "./shadow-world.test-helper.ts";

// How every red-team row runs (HAL-19463, "How every case works"): B0 changed in one place, then
// the real reader and runner end to end, then the row's one reason, no leaks and GETs only.

/** One row of Julian's list: its id, its change from B0 and the check that proves its reason. */
export interface RedTeamRow {
  readonly id: string;
  readonly change: string;
  readonly check: () => Promise<unknown>;
}

/** Every fake Paperclip the suite used, for the one recorder of A35. */
export const everyFake: FakePaperclip[] = [];

/** The digest's day: B0's. */
export const digestDay = "2026-11-27";

/** Runs `world` through start and `polls` polls, calling `between` before each poll. */
export async function shadowRun(
  world: World,
  options: { polls?: number; between?: (poll: number) => void; store?: MemoryLedgerStore } = {},
) {
  const run = runnerFor(world, options.store);
  everyFake.push(run.fake);
  assert.equal(await run.runner.start(), undefined);
  for (let poll = 0; poll < (options.polls ?? 1); poll += 1) {
    options.between?.(poll);
    await run.runner.poll();
  }
  const digest = shadowDigest({
    day: digestDay,
    entries: run.store.stored,
    calls: run.reader.counts(),
    ...documentsOf(run.runner),
    build: "abc1234",
    until: new Date(t0.getTime() + hour),
  });
  return { ...run, digest };
}

/** The runner's last-read documents, for the digest, when it read them. */
function documentsOf(runner: ShadowRunner) {
  const documents = runner.documents();
  return documents === undefined ? {} : { documents };
}

/** B0 changed by `arrange` gives one card entry with `reason`, and a poll that went through. */
export async function expectCard(arrange: (world: World) => void, reason: string) {
  const world = b0();
  arrange(world);
  const run = await shadowRun(world);
  assert.deepEqual(cardReasons(run.store), [reason]);
  assert.deepEqual(runReasons(run.store), ["run.started", "poll.ran"]);
  expectNoDecision(run.store);
  expectNoLeaks(world, run);
  return run;
}

/** B0 changed by `arrange` stops the poll with `reason`: one run entry, no card entries. */
export async function expectStop(arrange: (world: World) => void, reason: string) {
  const world = b0();
  arrange(world);
  const run = await shadowRun(world);
  assert.deepEqual(cardReasons(run.store), []);
  assert.deepEqual(runReasons(run.store), ["run.started", reason]);
  assert.ok(run.digest.includes(`- stopped by ${reason}: 1`), `- stopped by ${reason}: 1`);
  expectNoLeaks(world, run);
  return run;
}

/** Every entry says "no decision": shadow mode never records anything else in v1. */
export function expectNoDecision(store: MemoryLedgerStore): void {
  assert.equal(
    store.stored.every((entry) => entry.outcome === "no_decision"),
    true,
  );
}

/** Ids and timestamps aren't agent text; everything else in a claim is. */
const notAgentText = /^([0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}|[\d:.TZ-]+)$/;

/**
 * No agent-written text of the world, and never the key, reaches the ledger or the digest (A13,
 * A36, A38). Known values, such as a type the card keeps, are allowed.
 */
export function expectNoLeaks(world: World, run: { store: MemoryLedgerStore; digest: string }) {
  const written = `${JSON.stringify(run.store.stored)}\n${run.digest}`;
  const known = ["request_board_approval", "hire_agent", "tool_gateway", "pending", company];
  for (const text of agentTexts(world)) {
    if (text.length < 6 || notAgentText.test(text) || known.includes(text)) continue;
    assert.equal(written.includes(text), false, `leaked: ${text.slice(0, 40)}`);
  }
  assert.ok(!written.includes(canaryKey));
}

function agentTexts(world: World): string[] {
  return world.approvals.flatMap((approval) => [
    ...stringsOf(approval.record["payload"]),
    ...approval.comments.map((each) => String(each["body"])),
    ...approval.issues.flatMap((each) => [String(each["title"]), String(each["description"])]),
  ]);
}

function stringsOf(value: unknown, depth = 0): string[] {
  if (depth > 50) return [];
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  // Keys are left out: short words such as `source` are also in reason codes.
  return Object.values(value).flatMap((inner) => stringsOf(inner, depth + 1));
}

/** Every request `fake` saw is a GET on the shadow list (A35). */
export function expectShadowGetsOnly(fake: FakePaperclip): void {
  for (const request of fake.seen) {
    const onList = shadowRequestNames.some((name) =>
      matchesRequest(name, request.method, request.path),
    );
    assert.equal(onList && request.method === "GET", true, `${request.method} ${request.path}`);
  }
}
