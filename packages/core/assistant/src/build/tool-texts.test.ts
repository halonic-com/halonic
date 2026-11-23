import { describe, expect, it } from "vitest";
import { toolTexts } from "./tool-texts.ts";

const toReview =
  "The person reviews the change and accepts or rejects it; until then it's marked as yours to review.";

describe("toolTexts", () => {
  it.each([
    [toolTexts.changed("agents/writer.md"), `Changed agents/writer.md. ${toReview}`],
    [toolTexts.deleted("agents/writer.md"), `Deleted agents/writer.md. ${toReview}`],
    [
      toolTexts.readFirst("agents/writer.md"),
      "Read agents/writer.md first, then make your change.",
    ],
    [
      toolTexts.held("agents/writer.md"),
      "agents/writer.md changed outside Halonic and waits for the person to compare it. Change it again once they have.",
    ],
    [toolTexts.cantWrite(".git/config"), "Couldn't change .git/config: it can't be written to."],
    [toolTexts.cantRead(".env"), "Couldn't read .env: it can't be read."],
    [toolTexts.doesNotExist("agents/missing.md"), "Error: agents/missing.md does not exist"],
    [toolTexts.moreFiles(12), '… and 12 more. Pass "under" to list one folder.'],
    [
      toolTexts.unknownKind("robot", ["agent", "workflow"]),
      'Error: there is no kind "robot". The kinds are: agent, workflow.',
    ],
  ])("words %j", (text, expected) => {
    expect(text).toBe(expected);
  });

  it("refuses an untrusted write with AI changes 1.11's words", () => {
    expect(toolTexts.untrustedWrite).toBe("Not trusted yet: only Halonic items can be changed.");
  });
});
