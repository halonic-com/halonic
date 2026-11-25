import { verifies } from "@halonicjs/testing-spec";
import type { ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { afterEach, expect, test, vi } from "vitest";
import { amsterdamTime } from "../amsterdam-time.ts";
import { at, pull, snapshot } from "../board-check/merge-speed.test-helper.ts";
import type { MergeSpeedRecord } from "../board-check/merge-speed.ts";
import type { AgentMergeRecord } from "../snapshot/agent-merges.ts";
import { checkerTask, fakeBoardContext } from "./board-check.test-helper.ts";
import { boardCheck } from "./board-check.ts";
import { type BoardToolsApi, registerBoardTools } from "./board-tools.ts";
import { manifest } from "./manifest.ts";

const settings = { boardCheckerTask: checkerTask.id, boardCheckWritesForVersion: manifest.version };

function setUp() {
  return fakeBoardContext({ tasks: [checkerTask], comments: {}, config: () => settings });
}

/** A record whose last reported figures were a 20-minute median, with four 60-minute merges since. */
const slowedDown: MergeSpeedRecord = {
  trackingSince: at("08:00"),
  snapshotAt: at("14:50"),
  queued: [],
  exits: [11, 12, 13, 14].map((number) => ({
    pull: `acme/app#${number}`,
    outcome: "merged",
    at: at("14:00"),
    minutesInQueue: 60,
  })),
  reported: {
    hours: 6,
    merges: 0,
    mergesPerHour: 0,
    exits: 4,
    dropRate: 0,
    medianMinutes: 20,
    longestMinutes: 20,
  },
};

verifies("paperclip.board-check-merge-speed", () => {
  test("follows the queue on every pass from the snapshot in plugin state", async () => {
    const fake = setUp();
    const board = boardCheck(fake.ctx);
    fake.state.set("snapshot", snapshot(at("14:20"), [[11, at("14:00")]], []));
    await board.run(clock("14:20"));
    fake.state.set("snapshot", snapshot(at("14:30"), [], [pull(11, at("14:25"))]));
    await board.run(clock("14:30"));
    expect((fake.state.get("merge-speed") as MergeSpeedRecord).exits).toEqual([
      { pull: "acme/app#11", outcome: "merged", at: at("14:25"), minutesInQueue: 25 },
    ]);
  });

  test("comments the 6-hour trend on the Board Checker's task on the hour, only when it moved", async () => {
    const fake = setUp();
    const board = boardCheck(fake.ctx);
    fake.state.set("snapshot", snapshot(at("14:55"), [], []));
    fake.state.set("merge-speed", slowedDown);
    await board.run(clock("15:05"));
    await board.run(clock("16:05"));
    const comments = fake.sent.filter((write) => write.call === "createComment");
    expect(comments.map((write) => write.args[0])).toEqual([checkerTask.id]);
    expect(String(comments[0]?.args[1])).toContain(
      "Merge speed changed (time in queue), last 6 hours:",
    );
    expect(String(comments[0]?.args[1])).toMatch(/Board check \(plugin\)$/);
  });

  test("comments the trend on the first hour after the board turns writes on, with the same figures", async () => {
    let config: Record<string, unknown> = { boardCheckerTask: checkerTask.id };
    const fake = fakeBoardContext({ tasks: [checkerTask], comments: {}, config: () => config });
    const board = boardCheck(fake.ctx);
    fake.state.set("snapshot", snapshot(at("14:55"), [], []));
    fake.state.set("merge-speed", slowedDown);
    await board.run(clock("15:05"));
    config = settings;
    fake.state.set("snapshot", snapshot(at("16:00"), [], []));
    await board.run(clock("16:05"));
    const comments = fake.sent.filter((write) => write.call === "createComment");
    expect(comments).toHaveLength(1);
    expect(String(comments[0]?.args[1])).toContain("Merge speed changed (time in queue)");
  });

  test("skips the part when there is no snapshot yet", async () => {
    const fake = setUp();
    await boardCheck(fake.ctx).run(clock("15:00"));
    expect(fake.state.has("merge-speed")).toBe(false);
  });
});

/** 22 Nov at `time` as a Date, for a job pass. */
function clock(time: string) {
  return new Date(at(time));
}

type Handler = (params: unknown, runCtx: ToolRunContext) => Promise<ToolResult>;

function mergeSpeedTool(fake: ReturnType<typeof setUp>): Handler {
  const handlers = new Map<string, Handler>();
  registerBoardTools({
    tools: { register: (name: string, _: unknown, fn: Handler) => handlers.set(name, fn) },
    agents: fake.ctx.agents,
    issues: fake.ctx.issues,
    state: fake.ctx.state,
    config: fake.ctx.config,
    metrics: fake.ctx.metrics,
  } as unknown as BoardToolsApi);
  const handler = handlers.get("merge_speed");
  if (handler === undefined) {
    throw new Error("merge_speed isn't registered.");
  }
  return handler;
}

const runCtx: ToolRunContext = {
  agentId: "agent-merger",
  runId: "run-1",
  companyId: "acme",
  projectId: "",
};

verifies("paperclip.merge-speed-tool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("answers the figures for the hours asked, with since when exits count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(at("15:00")));
    const fake = setUp();
    fake.state.set("snapshot", snapshot(at("14:55"), [], [pull(11, at("14:00"))]));
    fake.state.set("merge-speed", slowedDown);
    const result = await mergeSpeedTool(fake)({ hours: 2 }, runCtx);
    expect(result.content).toBe(
      [
        `Merge speed, last 2 hours, from the snapshot of ${amsterdamTime(at("14:55"))}:`,
        "- Merges: 1 (0.5 per hour).",
        "- Dropped from the queue without merging: 0% of 4 exits.",
        "- Time in queue of the merged ones: median 60 min, longest 60 min.",
        `Queue exits counted since ${amsterdamTime(at("08:00"))}; earlier ones are missing.`,
      ].join("\n"),
    );
  });

  test("answers with an error before the first snapshot and for hours out of range", async () => {
    const fake = setUp();
    const tool = mergeSpeedTool(fake);
    expect((await tool({}, runCtx)).error).toContain("no figures yet");
    expect((await tool({ hours: 0 }, runCtx)).error).toBe(
      "merge_speed: hours must be a whole number from 1 to 168.",
    );
  });
});

verifies("paperclip.agent-merge-counts", () => {
  test("keeps each agent's merges from the snapshot on every pass", async () => {
    const fake = setUp();
    const board = boardCheck(fake.ctx);
    fake.state.set("snapshot", snapshot(at("14:30"), [], [pull(11, at("14:25"))]));
    await board.run(clock("14:30"));
    fake.state.set(
      "snapshot",
      snapshot(at("14:40"), [], [pull(11, at("14:25")), pull(12, at("14:35"))]),
    );
    await board.run(clock("14:40"));
    expect((fake.state.get("agent-merges") as AgentMergeRecord).merges).toEqual([
      { pull: "acme/app#11", agent: "mateo", at: at("14:25") },
      { pull: "acme/app#12", agent: "mateo", at: at("14:35") },
    ]);
  });
});
