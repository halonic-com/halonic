import { type RunEvent, type RunEventBody, summarize } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ActiveRun, waitsInProgress } from "./waits-in-progress.ts";

/** One event of a test log: its body, the second it was written at, and its branch if any. */
interface Line {
  body: RunEventBody;
  second: number;
  branch?: string;
}

const tenOClock = Date.UTC(2026, 10, 9, 10, 0, 0);

function at(second: number): string {
  return new Date(tenOClock + second * 1000).toISOString();
}

/** A run of the workflow `publish` in the hub `acme`, started at 10:00:00, then `lines`. */
function run(runId: string, lines: readonly Line[]): ActiveRun {
  const started: RunEventBody = {
    type: "run.started",
    hubId: "acme",
    workflowId: "publish",
    input: {},
    kind: "run",
    definitionsVersion: "v1",
  };
  const events = [{ body: started, second: 0 }, ...lines].map(
    ({ body, second, branch }, index): RunEvent => ({
      runId,
      seq: index + 1,
      at: at(second),
      ...(branch === undefined ? {} : { branch }),
      ...body,
    }),
  );
  const summary = summarize(events);
  if (summary === null) throw new Error("the test log must start with run.started");
  return { summary, events };
}

const harnessStarted: RunEventBody = {
  type: "harness.started",
  state: "write",
  agent: "writer",
  harness: "claude-code",
  timeoutMs: 60_000,
};

verifies("app.resource-report-waits", () => {
  it("lists a harness that hasn't answered, with how long it has waited", () => {
    const writing = run("r1", [{ body: harnessStarted, second: 0 }]);

    expect(waitsInProgress([writing], new Date(tenOClock + 4000))).toEqual([
      {
        kind: "harness",
        runId: "r1",
        since: at(0),
        waitedMs: 4000,
        state: "write",
        agent: "writer",
        harness: "claude-code",
        timeoutMs: 60_000,
        overdue: false,
      },
    ]);
  });

  it("marks a wait overdue once it has waited longer than its limit", () => {
    const writing = run("r1", [{ body: harnessStarted, second: 0 }]);

    const [atTheLimit] = waitsInProgress([writing], new Date(tenOClock + 60_000));
    const [pastTheLimit] = waitsInProgress([writing], new Date(tenOClock + 90_000));

    expect(atTheLimit).toMatchObject({ overdue: false });
    expect(pastTheLimit).toMatchObject({ overdue: true, waitedMs: 90_000 });
  });

  it("drops a sandbox once it has opened", () => {
    const opened = run("r1", [
      {
        body: { type: "sandbox.started", state: "write", agent: "writer", timeoutMs: 30_000 },
        second: 1,
      },
      {
        body: {
          type: "sandbox.opened",
          state: "write",
          agent: "writer",
          sandbox: {
            strength: "os",
            workingFolder: "~/acme/files/agents/writer",
            readOnlyPaths: [],
            deniedGroups: [],
            deniedPaths: [],
            allowedSites: [],
            timeLimitMs: 600_000,
          },
        },
        second: 2,
      },
    ]);

    expect(waitsInProgress([opened], new Date(tenOClock + 5000))).toEqual([]);
  });

  it("drops a connector once its tool result, which names no state, is written", () => {
    const answered = run("r1", [
      { body: { type: "tool.called", agent: "writer", tool: "mail.send", args: {} }, second: 1 },
      {
        body: {
          type: "connector.started",
          state: "write",
          agent: "writer",
          connector: "mail",
          timeoutMs: 30_000,
        },
        second: 1,
      },
      {
        body: { type: "tool.result", agent: "writer", tool: "mail.send", result: "sent" },
        second: 2,
      },
    ]);

    expect(waitsInProgress([answered], new Date(tenOClock + 5000))).toEqual([]);
  });

  it("keeps a branch's wait when another branch with the same agent writes", () => {
    const parallel = run("r1", [
      { body: harnessStarted, second: 1, branch: "a" },
      {
        body: { type: "tool.called", agent: "writer", tool: "files.read", args: {} },
        second: 2,
        branch: "b",
      },
    ]);

    const waits = waitsInProgress([parallel], new Date(tenOClock + 5000));

    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({ kind: "harness", since: at(1) });
  });

  it("keeps a wait when a later event comes from another agent", () => {
    const writing = run("r1", [
      { body: harnessStarted, second: 1 },
      { body: { type: "tool.called", agent: "editor", tool: "files.read", args: {} }, second: 2 },
    ]);

    expect(waitsInProgress([writing], new Date(tenOClock + 5000))).toHaveLength(1);
  });

  it("lists a waiting run since its last run.waiting, with what it accepts", () => {
    const paying = run("r2", [
      { body: { type: "state.entered", state: "pay" }, second: 1 },
      {
        body: {
          type: "approval.requested",
          state: "pay",
          agent: "clerk",
          tool: "bank.pay",
          args: {},
          callId: "c1",
          resume: { messages: [], calls: [], step: 1 },
        },
        second: 2,
      },
      { body: { type: "run.waiting", state: "pay", events: ["approve", "reject"] }, second: 3 },
    ]);

    expect(waitsInProgress([paying], new Date(tenOClock + 10_000))).toEqual([
      {
        kind: "run",
        runId: "r2",
        since: at(3),
        waitedMs: 7000,
        state: "pay",
        accepts: ["approve", "reject"],
        approvals: 1,
        nextTimer: null,
      },
    ]);
  });

  it("lists no waits for a run that has ended", () => {
    const failed = run("r3", [
      { body: harnessStarted, second: 1 },
      { body: { type: "run.failed", state: "write", error: "stopped" }, second: 2 },
    ]);

    expect(waitsInProgress([failed], new Date(tenOClock + 5000))).toEqual([]);
  });

  it("puts the waits of every run oldest first", () => {
    const later = run("r1", [{ body: harnessStarted, second: 20 }]);
    const earlier = run("r2", [
      {
        body: { type: "sandbox.started", state: "plan", agent: "planner", timeoutMs: 30_000 },
        second: 10,
      },
    ]);

    const waits = waitsInProgress([later, earlier], new Date(tenOClock + 30_000));

    expect(waits.map((wait) => wait.runId)).toEqual(["r2", "r1"]);
  });
});

describe("waitsInProgress", () => {
  it("never gives a negative wait when the clock is behind the log", () => {
    const writing = run("r1", [{ body: harnessStarted, second: 10 }]);

    const [wait] = waitsInProgress([writing], new Date(tenOClock));

    expect(wait).toMatchObject({ waitedMs: 0, overdue: false });
  });
});
