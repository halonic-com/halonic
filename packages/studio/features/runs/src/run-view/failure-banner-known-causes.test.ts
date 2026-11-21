import { answerNotAnOptionCause } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { context, event, failed, failedEvent, lines } from "./failure-banner.test-helper.ts";
import { causeBanner } from "./failure-banner.ts";

verifies("runs.run-view.failure-banners", () => {
  it("says the disk is full, in the step it stopped in", () => {
    expect(lines(causeBanner(failed("disk-full"), undefined, context, false))).toEqual([
      "Support reply stopped in the step Draft: the disk is full, so Halonic couldn't write the run log. Free some space, then run again.",
    ]);
  });

  it("says the engine stopped, during a step or before the first", () => {
    const during = failed("interrupted", { statesVisited: ["draft"] });
    expect(lines(causeBanner(during, undefined, context, false))).toEqual([
      "Support reply stopped because Halonic's engine stopped during the step Draft. Nothing after that step ran.",
    ]);
    const before = failed("interrupted", { statesVisited: [], state: null });
    expect(lines(causeBanner(before, undefined, context, false))).toEqual([
      "Support reply stopped because Halonic's engine stopped before the first step. Nothing ran.",
    ]);
  });

  describe("an answer that isn't one of the step's choices (R7)", () => {
    const offChoice = failed("answer-not-an-option", {
      error:
        'The agent sorter answered "maybe", which isn\'t one of its options (refund, question, spam).',
      cause: answerNotAnOptionCause({ agent: "sorter", options: ["refund", "question", "spam"] }),
    });

    it("names the agent and the step's choices from the cause, before the log is read", () => {
      const banner = causeBanner(offChoice, undefined, context, false);
      expect(lines(banner)).toEqual([
        "Support reply failed in the step Draft: Sorter's answer wasn't one of the step's choices (refund, question or spam).",
      ]);
      expect(banner?.kind === "callout" && banner.fixes).toEqual([{ kind: "see-step" }]);
    });

    it("never quotes the answer", () => {
      expect(lines(causeBanner(offChoice, undefined, context, false))?.join(" ")).not.toContain(
        "maybe",
      );
    });

    it("names the agent as its file does, and two choices with or", () => {
      const two = failed("answer-not-an-option", {
        cause: answerNotAnOptionCause({ agent: "sorter", options: ["yes", "no"] }),
      });
      const named = { ...context, agentName: () => "Mail sorter" };
      expect(lines(causeBanner(two, undefined, named, false))?.[0]).toContain(
        ": Mail sorter's answer wasn't one of the step's choices (yes or no).",
      );
    });
  });

  describe("an answer that isn't one of the agent's options, in a log without the choices", () => {
    const started = (agent: string, seq: number) =>
      event({ type: "agent.started", state: "draft", agent }, seq);

    it("names the agent that started last, never its answer", () => {
      const banner = causeBanner(
        failed("answer-not-an-option", { error: 'Agent "triage" answered "maybe", which …' }),
        [started("triage", 1), failedEvent()],
        context,
        false,
      );
      expect(lines(banner)).toEqual([
        "Support reply stopped in the step Draft: Triage answered with something that isn't one of its options. Make its instructions stricter, or pick a larger model, then run again.",
      ]);
      expect(lines(banner)?.join(" ")).not.toContain("maybe");
    });

    it("names the parallel branch whose answer it was", () => {
      const branch = event(
        {
          type: "agent.finished",
          state: "draft",
          agent: "web",
          output: null,
          reason: "answer-not-an-option",
        },
        3,
      );
      const log = [started("triage", 1), started("web", 2), branch];
      expect(
        lines(causeBanner(failed("answer-not-an-option"), log, context, false))?.[0],
      ).toContain(": Web answered with something");
    });

    it("waits for the log, and for an agent in it", () => {
      const run = failed("answer-not-an-option");
      expect(causeBanner(run, undefined, context, false)).toBeUndefined();
      expect(causeBanner(run, [failedEvent()], context, false)).toBeUndefined();
    });
  });

  describe("a bridge socket path that is too long (HAL-13862)", () => {
    const tooLong = (detail?: Record<string, string>) =>
      failed("error", {
        error: "The bridge's socket path would be 161 bytes, and Linux takes at most 107.",
        cause: {
          kind: "invalid_input",
          code: "harness-bridge.socket-path-too-long",
          ...(detail === undefined ? {} : { detail }),
        },
      });
    const linux = { bytes: "161", limit: "107", system: "Linux" };

    it("says the cause and the fix from the typed cause, before the log is read", () => {
      expect(lines(causeBanner(tooLong(linux), undefined, context, false))).toEqual([
        "Support reply stopped in the step Draft: the path to Halonic's data is too long for the bridge's socket (161 bytes, and Linux takes at most 107). Move Halonic's data to a shorter path, then run again.",
      ]);
    });

    it("says to fix it on the computer on a phone", () => {
      expect(lines(causeBanner(tooLong(linux), undefined, context, true))?.[0]).toContain(
        "Move Halonic's data to a shorter path on your computer, then run again.",
      );
    });

    it("leaves the figures out when the cause doesn't give them all", () => {
      expect(
        lines(causeBanner(tooLong({ bytes: "161", system: "Linux" }), [], context, false)),
      ).toEqual([
        "Support reply stopped in the step Draft: the path to Halonic's data is too long for the bridge's socket. Move Halonic's data to a shorter path, then run again.",
      ]);
    });
  });
});
