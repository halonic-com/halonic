import { type RunEvent, summarize } from "@halonicjs/events";
import type { Workflow, WorkflowState } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  answer,
  play,
  replyWorkflow,
  startInput,
} from "../../kernel/kernel-test-kit.test-helper.ts";

type Signal = NonNullable<WorkflowState["signal"]>;

const sent: Signal = {
  name: "reply.sent",
  data: { to: "{{input.from}}", reply: "{{context.reply}}", tone: "{{context.tone}}", fixed: 7 },
};

/** The reply workflow, with `draft` and `sent` given these signals. */
function reply(signals: { draft?: Signal; sent?: Signal }): Workflow {
  const states: Record<string, WorkflowState> = {};
  for (const [id, state] of Object.entries(replyWorkflow.states)) {
    const signal = id === "draft" ? signals.draft : signals.sent;
    states[id] = signal === undefined ? state : { ...state, signal };
  }
  return { ...replyWorkflow, context: { tone: "friendly" }, states };
}

/** The data of the run's `signal.sent` events, without the step that sent them. */
function signalsOf(log: readonly RunEvent[]) {
  return log.flatMap((event) =>
    event.type === "signal.sent"
      ? [{ state: event.state, name: event.name, data: event.data, at: event.at }]
      : [],
  );
}

/** The run of `workflow` once the writer answers "On its way". */
function finished(workflow: Workflow) {
  return play(workflow, [startInput("sha-1"), answer("call-1", "On its way")]);
}

verifies("engine.final-signal", () => {
  it("sends a final state's signal before run.completed, rendered from the input and the context", () => {
    const { log, run } = finished(reply({ sent }));
    expect(log.slice(-3).map(({ runId: _r, seq: _s, at: _a, ...body }) => body)).toEqual([
      { type: "state.entered", state: "sent" },
      {
        type: "signal.sent",
        state: "sent",
        name: "reply.sent",
        data: { to: "support", reply: "On its way", tone: "friendly", fixed: 7 },
      },
      expect.objectContaining({ type: "run.completed", state: "sent" }),
    ]);
    expect(run?.status).toBe("completed");
    expect(summarize(log)?.signals).toEqual([
      expect.objectContaining({
        name: "reply.sent",
        data: expect.objectContaining({ to: "support" }),
      }),
    ]);
  });

  it("sends a signal with no data as an empty object, and none for a final state without one", () => {
    const empty = finished(reply({ sent: { name: "reply.sent", data: {} } }));
    expect(empty.log.at(-2)).toMatchObject({ type: "signal.sent", name: "reply.sent", data: {} });

    const quiet = finished(reply({}));
    expect(quiet.log.slice(-2).map(({ type }) => type)).toEqual(["state.entered", "run.completed"]);
  });

  // Parity with the other states: the same signal sends the same event from a
  // final state as from the task before it, once the task's output is written.
  it("sends the same name and data as a task state with the same signal", () => {
    const fromTask = signalsOf(finished(reply({ draft: sent })).log);
    const fromFinal = signalsOf(finished(reply({ sent })).log);
    expect(fromTask.map(({ state }) => state)).toEqual(["draft"]);
    expect(fromFinal.map(({ state }) => state)).toEqual(["sent"]);
    expect(fromFinal.map(({ state: _s, ...sameAs }) => sameAs)).toEqual(
      fromTask.map(({ state: _s, ...sameAs }) => sameAs),
    );
  });
});
