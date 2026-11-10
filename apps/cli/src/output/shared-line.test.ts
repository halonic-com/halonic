import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineMessages } from "../messages/define.ts";
import { phrase, plainText } from "../messages/phrase.ts";
import type { LiveLine } from "./progress.ts";
import { sharedLine } from "./shared-line.ts";

const steps = defineMessages("test", {
  draftReply: () => phrase`◌ Draft a reply`,
});

/** What reached the screen, in order: each drawn line, "(cleared)", and each other line written. */
function screen(): LiveLine & { readonly seen: string[] } {
  const seen: string[] = [];
  return {
    seen,
    draw: (message) => seen.push(`draw ${plainText(message.phrase)}`),
    clear: () => seen.push("(cleared)"),
  };
}

verifies("cli.progress", () => {
  it("writes another line above the live line, then draws the live line again", () => {
    const terminal = screen();
    const line = sharedLine(terminal);
    line.draw(steps.draftReply());
    line.around(() => terminal.seen.push("! Anthropic is slow today."));
    expect(terminal.seen).toEqual([
      "draw ◌ Draft a reply",
      "(cleared)",
      "! Anthropic is slow today.",
      "draw ◌ Draft a reply",
    ]);
  });

  it("only writes the other line when no live line is shown", () => {
    const terminal = screen();
    const line = sharedLine(terminal);
    line.draw(steps.draftReply());
    line.clear();
    line.around(() => terminal.seen.push("✓ Draft a reply"));
    expect(terminal.seen).toEqual(["draw ◌ Draft a reply", "(cleared)", "✓ Draft a reply"]);
  });

  it("takes the line away for good when the command ends", () => {
    const terminal = screen();
    const line = sharedLine(terminal);
    line.draw(steps.draftReply());
    line.close();
    line.draw(steps.draftReply());
    line.around(() => terminal.seen.push("✓ Done"));
    expect(terminal.seen).toEqual(["draw ◌ Draft a reply", "(cleared)", "✓ Done"]);
  });
});
