// Memory admission (HAL-17463): 24 fast slots start at more memory than the CI VM has, so a fast
// slot registers a runner only while the VM can still give it its start size plus the reserve,
// after what idle fast runners and busy jobs were already promised. These tests run the slot
// script's fast_room as shipped against a stand-in /proc/meminfo and state folder.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { dir, read } from "./hook-run.mjs";

const GiB = 1024 ** 3;
const slot = read("vm/halonic-runner-slot.sh");
const now = () => Math.floor(Date.now() / 1000);

// Runs fast_room for `me` with MemAvailable `availGiB` (null: no such line) and `states` as the
// slots' state files, by slot name (a string is written as it is). A state object gets
// updated_at = now, as a running slot's has, unless it sets its own (undefined: none).
const room = ({ me = "fast-11", availGiB, states = {} }) => {
  const fn = slot.match(/^fast_room\(\) \{\n[\s\S]*?\n\}$/m);
  assert.ok(fn, "fast_room() in vm/halonic-runner-slot.sh");
  const base = mkdtempSync(join(dir, "fast-admit-"));
  const meminfo = join(base, "meminfo");
  const kib = availGiB === null ? "" : `MemAvailable:   ${(availGiB * GiB) / 1024} kB\n`;
  writeFileSync(meminfo, `MemTotal:       75497472 kB\n${kib}`);
  for (const [name, state] of Object.entries(states)) {
    const text =
      typeof state === "string"
        ? state
        : JSON.stringify({ slot: name, updated_at: now(), ...state });
    writeFileSync(join(base, `${name}.state`), text);
  }
  const res = spawnSync(
    "/bin/bash",
    [
      "-c",
      `${fn[0]}\nSLOT=$1 STATES=$2 MEMINFO=$3 STALE_S=$4 BUSY_ROOM_B=$5 fast_room`,
      "x",
      me,
      base,
      meminfo,
      "120",
      String(2 * GiB),
    ],
    { encoding: "utf8" },
  );
  return { ok: res.status === 0, bytes: Number(res.stdout.trim()), out: res.stderr };
};

const fastIdle = { label: "halonic-ci-fast", busy: false, mem_limit: 4 * GiB, mem_peak: 0 };
const largeIdle = { label: "halonic-ci-large", busy: false, mem_limit: 6 * GiB, mem_peak: 0 };

test("fast admission: an idle fast runner's start size and a busy job's room count as promised", () => {
  const res = room({
    availGiB: 40,
    states: {
      "fast-12": fastIdle,
      // 10 GB limit, 3 GB used: it may still take 7 GB without asking, but counts for 2 GB
      // (HAL-17574).
      "large-1": { label: "halonic-ci-large", busy: true, mem_limit: 10 * GiB, mem_peak: 3 * GiB },
      // Above its limit (file cache in the peak): it promises nothing more, never less than nothing.
      "fast-1": { label: "halonic-ci-fast", busy: true, mem_limit: 4 * GiB, mem_peak: 5 * GiB },
      // An idle large runner holds nothing back: merge groups keep the memory first.
      "large-2": largeIdle,
      // This slot's own state from its last cycle doesn't count against it.
      "fast-11": fastIdle,
    },
  });
  assert.equal(res.ok, true, res.out);
  assert.equal(res.bytes, (40 - 4 - 2) * GiB);
});

test("fast admission: 24 fast slots on a 72 GB VM register only as many runners as fit", () => {
  // About 66 GB available with the large pool idle: each runner needs its 4 GB start plus the
  // 4 GB reserve free after the ones before it, so 15 register (fast-11..24 and one more) and the
  // rest wait until jobs finish or the large pool frees memory.
  const states = {};
  let registered = 0;
  for (let n = 11; n <= 24; n++) {
    const me = `fast-${n}`;
    if (room({ me, availGiB: 66, states }).bytes < 8 * GiB) continue;
    states[me] = fastIdle;
    registered++;
  }
  assert.equal(registered, 14);
  const fifteenth = room({ me: "fast-1", availGiB: 66, states });
  assert.equal(fifteenth.bytes, 10 * GiB);
  states["fast-1"] = fastIdle;
  assert.ok(room({ me: "fast-2", availGiB: 66, states }).bytes < 8 * GiB);
});

test("fast admission: fails closed on an unreadable state file or no MemAvailable", () => {
  assert.equal(room({ availGiB: 40, states: { "fast-12": "{not json" } }).ok, false);
  assert.equal(room({ availGiB: null }).ok, false);
  // No state files at all: everything available is free.
  assert.equal(room({ availGiB: 40 }).bytes, 40 * GiB);
});

test("fast admission: only fast slots wait, under one lock, and a stopped slot leaves no promise", () => {
  assert.ok(
    slot.includes('if [ "$LABEL" = halonic-ci-fast ] && [ "${2:-}" != "--cleanup" ]; then'),
  );
  assert.ok(slot.includes('[ "$room" -ge "$NEED_B" ] || exit 1'));
  assert.ok(slot.includes(') 8>"$STATES/fast-admit.lock"; do'));
  assert.ok(slot.includes('NEED_B=$(( $(numfmt --from=iec "${MEM_START^^}") + RESERVE_B ))'));
  // A paused VM stops the wait as it stops a cycle.
  assert.ok(slot.includes('[ ! -e "$PAUSED" ] || exit 0'));
  assert.ok(slot.includes('  rm -f "$STATES/$SLOT.state" || echo'));
  // Admission comes before the runner is registered.
  assert.ok(slot.indexOf("fast-admit.lock") < slot.indexOf("generate-jitconfig"));
});

test("fast admission: a state not updated for 120 s, or with no updated_at, promises nothing (HAL-17558)", () => {
  assert.ok(slot.includes("RESERVE_B=4294967296; STALE_S=120"));
  const busy = { label: "halonic-ci-large", busy: true, mem_limit: 10 * GiB, mem_peak: 3 * GiB };
  // large-10, disabled two days ago as fast-2's twin, whose state was never removed.
  const stale = room({
    availGiB: 40,
    states: { "large-10": { ...busy, updated_at: now() - 170196 } },
  });
  assert.equal(stale.ok, true, stale.out);
  assert.equal(stale.bytes, 40 * GiB);
  // A running slot rewrote its state 2 s ago: its job's room still counts.
  const fresh = room({ availGiB: 40, states: { "large-1": { ...busy, updated_at: now() - 2 } } });
  assert.equal(fresh.bytes, (40 - 2) * GiB);
  // No updated_at (or not a number): ignored, like a stale one.
  const none = room({ availGiB: 40, states: { "large-1": { ...busy, updated_at: undefined } } });
  assert.equal(none.bytes, 40 * GiB);
  const text = room({ availGiB: 40, states: { "fast-12": { ...fastIdle, updated_at: "now" } } });
  assert.equal(text.bytes, 40 * GiB);
});

test("--cleanup removes any slot's state before anything that can fail (HAL-17558)", () => {
  const STATES_LINE = "STATES=/run/halonic-ci";
  assert.equal(slot.split(`${STATES_LINE}\n`).length, 2);
  for (const name of ["large-10", "fast-2", "small-1"]) {
    const base = mkdtempSync(join(dir, "slot-cleanup-"));
    const state = join(base, `${name}.state`);
    writeFileSync(state, JSON.stringify({ slot: name, busy: true, updated_at: now() }));
    const script = join(base, "slot.sh");
    writeFileSync(script, slot.replace(`${STATES_LINE}\n`, `STATES=${base}\n`));
    // No pool.env or App key here, so the cycle fails right after: the state must already be gone.
    const res = spawnSync("/bin/bash", [script, name, "--cleanup"], {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin" },
    });
    assert.notEqual(res.status, 0);
    assert.equal(existsSync(state), false, `${name}: ${res.stderr}`);
  }
  assert.ok(
    slot.indexOf('  rm -f "$STATES/$SLOT.state" ||') < slot.indexOf("/etc/halonic-ci/pool.env"),
  );
});

test("fast admission: a busy job counts for its use now plus at most 2 GB (HAL-17574)", () => {
  assert.ok(slot.includes("RESERVE_B=4294967296; STALE_S=120; BUSY_ROOM_B=2147483648"));
  const busy = (anon, limit = 8) => ({
    label: "halonic-ci-fast",
    busy: true,
    mem_limit: limit * GiB,
    mem_peak: 7 * GiB,
    ...(anon === undefined ? {} : { mem_anon: anon * GiB }),
  });
  // Its use now (anon + shmem), not memory.peak with the file cache: 8 - 3 = 5, capped at 2.
  assert.equal(room({ availGiB: 40, states: { "fast-1": busy(3) } }).bytes, 38 * GiB);
  // Less than 2 GB left under its limit: only that counts.
  assert.equal(room({ availGiB: 40, states: { "fast-1": busy(7.5) } }).bytes, 39.5 * GiB);
  // A state from before mem_anon falls back to memory.peak: 8 - 7 = 1.
  assert.equal(room({ availGiB: 40, states: { "fast-1": busy(undefined) } }).bytes, 39 * GiB);
  // Over its limit: nothing, never less than nothing.
  assert.equal(room({ availGiB: 40, states: { "fast-1": busy(9) } }).bytes, 40 * GiB);
  // Fast jobs go first if the VM runs out anyway.
  assert.ok(slot.includes('OOM_ADJ=0; [ "$LABEL" != halonic-ci-fast ] || OOM_ADJ=500'));
  assert.ok(slot.includes('--oom-score-adj "$OOM_ADJ"'));
  assert.ok(slot.includes("mem_peak:$peak, mem_anon:$anon, mem_limit:$memlimit,"));
});

test("fast admission: the board's 96 GB snapshot of 24 Nov now fits 22 fast runners, not 16 (HAL-17574)", () => {
  // 15:00 Spain: 68 GB available, 12 busy fast jobs (limits grown to 8 GB, about 3.3 GB used) and
  // 4 idle runners. Before, the busy jobs held 32 GB back and idle fast-1..10 runners 6 GB each, so 6
  // slots waited. Now each busy job counts 2 GB and every idle runner 4 GB: 68 - 24 - 16 = 28 GB, so
  // 6 more runners register (each needs its 4 GB start plus the 4 GB reserve free).
  const states = {};
  for (let n = 1; n <= 12; n++) {
    states[`fast-${n}`] = {
      label: "halonic-ci-fast",
      busy: true,
      mem_limit: 8 * GiB,
      mem_peak: 4 * GiB,
      mem_anon: 3.3 * GiB,
    };
  }
  for (let n = 13; n <= 16; n++) states[`fast-${n}`] = fastIdle;
  let registered = 0;
  for (let n = 17; n <= 40; n++) {
    const me = `fast-${n}`;
    if (room({ me, availGiB: 68, states }).bytes < 8 * GiB) continue;
    states[me] = fastIdle;
    registered++;
  }
  assert.equal(registered, 6);
});
