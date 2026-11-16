import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { harnessPorts } from "../harness/harness-test-kit.test-helper.ts";
import { KernelBlobs, KernelRuns, writerAgent } from "../kernel/kernel-test-kit.test-helper.ts";
import { replyStart, runsOn } from "./local-runs-test-kit.test-helper.ts";

const agents = { writer: writerAgent("claude-code") };

/** What Claude Code's bridge asks about: its own call id, `toolu_9`, is the only id a phone is shown. */
const bashCall = { callId: "toolu_9", tool: "Bash", args: { command: "rm -r drafts" } };

verifies("engine.remote-decision", () => {
  /** Starts the run with a Claude Code call that keeps running, and asks one bridge question. */
  async function askedQuestion() {
    const ports = harnessPorts();
    ports.harness.hangs = true;
    const runs = new KernelRuns();
    const setup = runsOn([], runs, { agents, harnesses: ports.options, blobs: new KernelBlobs() });
    await setup.executor.start(replyStart);
    const harnessCall = setup.scheduler.deliver("run_1", "harness:call-1");
    await vi.waitFor(() => expect(ports.harness.tasks).toHaveLength(1));
    const decision = setup.executor
      .bridgeApprovals("run_1")
      .request(bashCall, { signal: new AbortController().signal });
    await vi.waitFor(async () =>
      expect(await runs.get("run_1")).toMatchObject({ approvals: [{ callId: "call-2" }] }),
    );
    const phone = setup.executor.bridgeRemoteDecisions("run_1");
    const resolvers = () =>
      (runs.logs.get("run_1") ?? [])
        .filter(({ type }) => type === "approval.resolved")
        .map((event) => (event as { by?: unknown }).by);
    return { ...setup, runs, harnessCall, decision, phone, resolvers };
  }

  it("lets a phone allow a bridge question by its own call id, and logs the device", async () => {
    const { phone, decision, resolvers, executor, harnessCall } = await askedQuestion();

    expect(await phone.decide({ callId: "toolu_9", approved: true })).toBe("decided");

    expect((await decision).approved).toBe(true);
    expect(resolvers()).toEqual(["remote-device"]);
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("lets a phone deny a bridge question", async () => {
    const { phone, decision, executor, harnessCall } = await askedQuestion();

    expect(await phone.decide({ callId: "toolu_9", approved: false })).toBe("decided");

    expect((await decision).approved).toBe(false);
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("takes the first of a card and a phone answering at once", async () => {
    const { phone, decision, executor, harnessCall } = await askedQuestion();

    const [card, remote] = await Promise.allSettled([
      executor.send("run_1", "reject", undefined, { callId: "call-2" }),
      phone.decide({ callId: "toolu_9", approved: true }),
    ]);

    // The card is first: the phone is told so, and the run keeps the card's no.
    expect(card.status).toBe("fulfilled");
    expect(remote).toEqual({
      status: "fulfilled",
      value: expect.stringMatching(/^(already-decided|unknown)$/),
    });
    expect((await decision).approved).toBe(false);
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("tells a second phone decision that the first one won", async () => {
    const { phone, decision, executor, harnessCall } = await askedQuestion();

    await phone.decide({ callId: "toolu_9", approved: false });
    await decision;

    expect(await phone.decide({ callId: "toolu_9", approved: true })).toBe("unknown");
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("doesn't take a decision for an id the bridge never asked", async () => {
    const { phone, runs, resolvers, executor, harnessCall } = await askedQuestion();

    expect(await phone.decide({ callId: "call-2", approved: true })).toBe("unknown");
    expect(await phone.decide({ callId: "toolu_1", approved: true })).toBe("unknown");

    expect(resolvers()).toEqual([]);
    expect(await runs.get("run_1")).toMatchObject({ approvals: [{ callId: "call-2" }] });
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("doesn't decide after the run ended, and the question ends as no", async () => {
    const { phone, decision, executor, harnessCall } = await askedQuestion();

    await executor.cancel("run_1");
    await harnessCall;

    expect(await phone.decide({ callId: "toolu_9", approved: true })).toBe("unknown");
    expect((await decision).approved).toBe(false);
  });

  it("decides nothing for another run's bridge", async () => {
    const { executor, harnessCall } = await askedQuestion();

    const other = executor.bridgeRemoteDecisions("run_2");

    expect(await other.decide({ callId: "toolu_9", approved: true })).toBe("unknown");
    await executor.cancel("run_1");
    await harnessCall;
  });

  it("decides nothing when the executor runs no workflows", async () => {
    const { executor } = runsOn([], new KernelRuns(), {});

    const status = await executor
      .bridgeRemoteDecisions("run_1")
      .decide({ callId: "toolu_9", approved: true });

    expect(status).toBe("unknown");
  });
});
