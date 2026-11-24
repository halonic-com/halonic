import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { ago, entry, headOf, pass, pull, said, snapshot } from "../merge-control.test-helper.ts";
import { dayFromRecords } from "../sim/from-records.ts";
import { defaultSettings } from "../state.ts";
import { keptDays, type PassRecord, passRecord, pluginRecordStore } from "./record.ts";

function memoryState() {
  const values = new Map<string, unknown>();
  const id = (key: { stateKey: string }) => key.stateKey;
  return {
    values,
    state: {
      get: async (key: { stateKey: string }) => values.get(id(key)) ?? null,
      set: async (key: { stateKey: string }, value: unknown) => {
        values.set(id(key), value);
      },
      delete: async (key: { stateKey: string }) => {
        values.delete(id(key));
      },
    },
  };
}

function recordAt(at: string): PassRecord {
  const facts = snapshot({ takenAt: at });
  return passRecord(facts, pass(facts), defaultSettings, new Date(at));
}

verifies("paperclip.merge-control-record", () => {
  test("a pass is recorded without comment, review or log text", () => {
    const facts = snapshot({
      pulls: [
        pull(7, {
          texts: [
            said(`Liam: approved on head \`${headOf(7).slice(0, 7)}\``),
            said("private words", 20),
          ],
        }),
      ],
    });
    const record = passRecord(facts, pass(facts), defaultSettings, new Date(facts.takenAt));
    expect(record.ready).toEqual([7]);
    expect(record.snapshot.pulls[0]?.texts.map((text) => text.body)).toEqual(["", ""]);
    expect(record.actions.map((action) => action.kind)).toEqual(["enqueue"]);
    expect(JSON.stringify(record)).not.toContain("private words");
  });

  test("passes are kept 14 days, then deleted", async () => {
    const memory = memoryState();
    const store = pluginRecordStore(memory.state, "company-1");
    await store.save(recordAt("2026-11-01T10:00:00.000Z"));
    await store.save(recordAt("2026-11-01T10:01:00.000Z"));
    await store.save(recordAt(`2026-11-${String(keptDays).padStart(2, "0")}T10:00:00.000Z`));
    expect((await store.day("2026-11-01")).length).toBe(2);
    await store.save(recordAt(`2026-11-${keptDays + 1}T10:00:00.000Z`));
    expect(await store.day("2026-11-01")).toEqual([]);
    expect([...memory.values.keys()].filter((key) => key.includes("11-01"))).toEqual([]);
    expect(memory.values.get("days")).toEqual(["2026-11-14", "2026-11-15"]);
  });

  test("a recorded day gives the simulator each pull request's ready time, label and failure", () => {
    const fast = pull(8, { labels: ["built-on:paperclip", "fast-track"] });
    const first = snapshot({ takenAt: ago(30), pulls: [pull(7), fast] });
    const failed = snapshot({
      takenAt: ago(10),
      pulls: [pull(7), fast],
      queue: [entry(8, 1)],
      groupRuns: [
        {
          id: 1,
          conclusion: "failure",
          branch: `gh-readonly-queue/main/pr-7-${headOf(7).slice(0, 4)}`,
          url: "https://github.com/acme/tools/actions/runs/1",
          createdAt: ago(12),
          failedJobs: [],
        },
      ],
    });
    const records = [first, failed].map((facts) => ({
      ...passRecord(facts, pass(facts), defaultSettings, new Date(facts.takenAt)),
      at: facts.takenAt,
    }));
    const day = dayFromRecords("2026-11-24", records);
    expect(
      day.pulls.map(({ number, fastTrack, failsOnce }) => ({ number, fastTrack, failsOnce })),
    ).toEqual([
      { number: 7, fastTrack: false, failsOnce: true },
      { number: 8, fastTrack: true, failsOnce: false },
    ]);
    expect(day.pulls[0]?.readyAt).toBe(ago(30));
  });
});
