import type { HarnessAgent } from "@halonicjs/engine";
import type { BridgeApprovals, BridgeEvent, SandboxSession } from "@halonicjs/ports";
import type { Clock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { harnessAgentOf } from "./fakes.test-helper.ts";
import { type SandboxedAsksPaths, sandboxedAsks } from "./sandboxed-asks.ts";

const worktree = "/data/proposals/01JD8Q";
const workingFolder = `${worktree}/files/agents/writer`;

const writer = (() => {
  const agent = harnessAgentOf("writer", worktree);
  return { ...agent, harness: "claude-code", file: { ...agent.file, asks: "in-sandbox" } };
})() as HarnessAgent;

const fenced = { fence: { state: "fenced" }, profile: { workingFolder } } as SandboxSession;

const nobodyAnswers: BridgeApprovals = {
  request: async () => ({ approved: false, comment: "Nobody can answer." }),
};

const sameAsGiven: SandboxedAsksPaths = {
  resolve: async (path) => ({ real: path, linked: false }),
  windows: false,
};

/** A clock the test moves by hand. */
function handClock() {
  let nowMs = 0;
  const clock: Clock = { now: () => new Date(nowMs) };
  const moveTo = (ms: number): void => {
    nowMs = ms;
  };
  return { clock, moveTo };
}

/** The writer's in-sandbox approvals, fenced, writing to `recorded`. */
function approvalsWith(clock: Clock, paths: SandboxedAsksPaths = sameAsGiven) {
  const recorded: BridgeEvent[] = [];
  const asks = sandboxedAsks(writer, {
    inner: nobodyAnswers,
    recorder: { record: async (event) => void recorded.push(event) },
    paths,
    failed: () => {},
    clock,
  });
  asks.sessionOpened(fenced);
  const ask = (callId: string, tool: string, args: unknown) =>
    asks.approvals.request({ callId, tool, args }, { signal: new AbortController().signal });
  return { ask, recorded };
}

verifies("harness-host.allowed-waited", () => {
  it("writes how long Halonic took to answer, by the host's clock", async () => {
    const { clock, moveTo } = handClock();
    const paths: SandboxedAsksPaths = {
      ...sameAsGiven,
      resolve: async (path) => {
        moveTo(250); // the path took 250 ms to resolve
        return { real: path, linked: false };
      },
    };
    const { ask, recorded } = approvalsWith(clock, paths);

    const answer = await ask("c1", "Edit", { file_path: `${workingFolder}/reply.md` });

    expect(answer).toEqual({ approved: true });
    expect(recorded).toEqual([
      {
        type: "harness.allowed",
        agent: "writer",
        tool: "Edit",
        detail: `${workingFolder}/reply.md`,
        rule: "asks-in-sandbox",
        waitedMs: 250,
      },
    ]);
  });

  it("times each ask from when it came in, while another is still being answered", async () => {
    const { clock, moveTo } = handClock();
    const gates = new Map<string, PromiseWithResolvers<void>>([
      ["a.md", Promise.withResolvers<void>()],
      ["b.md", Promise.withResolvers<void>()],
    ]);
    const paths: SandboxedAsksPaths = {
      ...sameAsGiven,
      resolve: async (path) => {
        const name = path.split("/").at(-1) ?? "";
        await gates.get(name)?.promise;
        return { real: path, linked: false };
      },
    };
    const { ask, recorded } = approvalsWith(clock, paths);

    const first = ask("c1", "Edit", { file_path: `${workingFolder}/a.md` });
    moveTo(100);
    const second = ask("c2", "Edit", { file_path: `${workingFolder}/b.md` });
    moveTo(150);
    gates.get("b.md")?.resolve();
    await second;
    moveTo(400);
    gates.get("a.md")?.resolve();
    await first;

    expect(recorded).toMatchObject([
      { detail: `${workingFolder}/b.md`, waitedMs: 50 },
      { detail: `${workingFolder}/a.md`, waitedMs: 400 },
    ]);
  });

  it("writes 0 when the host's clock was set back during the ask", async () => {
    const readings = [1_000, 400];
    const setBack: Clock = { now: () => new Date(readings.shift() ?? 400) };
    const { ask, recorded } = approvalsWith(setBack);

    await ask("c1", "Bash", { command: "npm test" });

    expect(recorded).toMatchObject([{ tool: "Bash", waitedMs: 0 }]);
  });
});
