import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { SentAnswers } from "./sent-answers.ts";

/** An answer to approval `a1` of session `s1`, sent and then cut off by a drop. */
function cutOff(): SentAnswers {
  const answers = new SentAnswers();
  answers.sent("a1", "s1", "approve");
  answers.dropped(["a1"]);
  return answers;
}

verifies("remote.phone-remote-answers", () => {
  describe("an answer on its way", () => {
    it("shows as sent until the host settles or refuses it", () => {
      const answers = new SentAnswers();
      answers.sent("a1", "s1", "deny");
      answers.sent("a2", "s1", "approve");
      expect(answers.decisionFor("a1")).toBe("deny");
      answers.settled("a1");
      answers.refused("a2");
      expect(answers.decisionFor("a1")).toBeUndefined();
      expect(answers.decisionFor("a2")).toBeUndefined();
    });

    it("isn't touched by a catch-up while the connection holds", () => {
      const answers = new SentAnswers();
      answers.sent("a1", "s1", "approve");
      answers.listed(() => 4);
      answers.caughtUp("s1", 10);
      expect(answers.decisionFor("a1")).toBe("approve");
    });
  });

  describe("an answer cut off by a drop", () => {
    it("stays sent until the phone catches up to the first list after the reconnect", () => {
      const answers = cutOff();
      answers.listed(() => 7);
      answers.caughtUp("s1", 6);
      expect(answers.decisionFor("a1")).toBe("approve");
      answers.caughtUp("s1", 7);
      expect(answers.decisionFor("a1")).toBeUndefined();
    });

    it("is settled by the approval's own settle event", () => {
      const answers = cutOff();
      answers.listed(() => 7);
      answers.settled("a1");
      expect(answers.decisionFor("a1")).toBeUndefined();
    });

    it("keeps where it first caught up to, not a later list's", () => {
      const answers = cutOff();
      answers.listed(() => 7);
      answers.listed(() => 9);
      answers.caughtUp("s1", 7);
      expect(answers.decisionFor("a1")).toBeUndefined();
    });

    it("goes with its session when the session leaves the list", () => {
      const answers = cutOff();
      answers.listed(() => undefined);
      expect(answers.decisionFor("a1")).toBeUndefined();
    });

    it("isn't caught up by another session's events", () => {
      const answers = cutOff();
      answers.listed(() => 3);
      answers.caughtUp("s2", 50);
      expect(answers.decisionFor("a1")).toBe("approve");
    });
  });

  it("forgets everything when the computer is removed", () => {
    const answers = new SentAnswers();
    answers.sent("a1", "s1", "approve");
    answers.clear();
    expect(answers.decisionFor("a1")).toBeUndefined();
  });
});
