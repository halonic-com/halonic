import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { buildFeedbackTask, type FeedbackInput, feedbackTitle, isoWithOffset } from "./payload.ts";

/** Feedback from Acme's tester, sent in Madrid in winter. */
const input: FeedbackInput = {
  text: "Run list jumps\nIt scrolls to the top after every update.",
  app: "Halonic Studio",
  window: "Runs",
  capturedAt: new Date("2026-11-25T17:04:05.250Z"),
  utcOffsetMinutes: 60,
  studioVersion: "0.2.0",
  screenshot: { width: 1280, height: 660 },
  project: "Halonic apps",
  assignee: "Chief",
};

function taskOf(changes: Partial<FeedbackInput>) {
  const build = buildFeedbackTask({ ...input, ...changes });
  if (build.kind !== "task") {
    throw new Error(`expected a task, got ${build.kind}`);
  }
  return build.task;
}

verifies("feedback.payload", () => {
  it("makes a task titled by the first line, with the details under the text", () => {
    const task = taskOf({});

    expect(task.title).toBe("Run list jumps");
    expect(task.project).toBe("Halonic apps");
    expect(task.assignee).toBe("Chief");
    expect(task.description).toBe(
      [
        "Run list jumps",
        "It scrolls to the top after every update.",
        "",
        "---",
        "",
        "Sent from Studio's feedback shortcut.",
        "",
        "- App: `Halonic Studio`",
        "- Window: `Runs`",
        "- Time: 2026-11-25T18:04:05+01:00",
        "- Studio version: `0.2.0`",
        "- Screenshot: 1280 × 660 px, attached",
      ].join("\n"),
    );
    expect(task.screenshot).toEqual({
      fileName: "feedback-2026-11-25T18-04-05.png",
      contentType: "image/png",
      width: 1280,
      height: 660,
    });
  });

  it("sends without a screenshot when there is none", () => {
    const task = taskOf({ screenshot: null });

    expect(task.screenshot).toBeNull();
    expect(task.description).toContain("- Screenshot: none");
  });

  it("takes the first line with text, trimmed", () => {
    expect(feedbackTitle("\n   \r\n  Toast hides Send  \nmore")).toBe("Toast hides Send");
  });

  it("cuts a long first line to 80 characters with an ellipsis", () => {
    const title = feedbackTitle("a".repeat(100));

    expect(Array.from(title)).toHaveLength(80);
    expect(title.endsWith("a…")).toBe(true);
    expect(feedbackTitle("b".repeat(80))).toBe("b".repeat(80));
  });

  it("never cuts an emoji in half", () => {
    const title = feedbackTitle(`${"x".repeat(78)}🙂🙂🙂`);

    expect(title).toBe(`${"x".repeat(78)}🙂…`);
  });

  it("shows other apps' names as code, so their Markdown stays text", () => {
    const task = taskOf({ app: "", window: "[click](https://example.com)\n# `big`" });

    expect(task.description).toContain("- App: (none)");
    expect(task.description).toContain("- Window: `[click](https://example.com) # big`");
  });

  it("makes no task from empty text and says why", () => {
    expect(buildFeedbackTask({ ...input, text: " \n\t\n" })).toEqual({
      kind: "empty-text",
      message: "Write a line about what you saw.",
    });
  });

  it("writes the time with the computer's offset, west of UTC too", () => {
    const time = new Date("2026-11-25T02:30:00Z");

    expect(isoWithOffset(time, 0)).toBe("2026-11-25T02:30:00+00:00");
    expect(isoWithOffset(time, -210)).toBe("2026-11-24T23:00:00-03:30");
    expect(isoWithOffset(time, 330)).toBe("2026-11-25T08:00:00+05:30");
  });
});
