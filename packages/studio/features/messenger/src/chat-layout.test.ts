import type { Message } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatLines, dayLabel } from "./chat-layout.ts";
import type { TimelineEntry } from "./chat-timeline.ts";

const now = new Date(2026, 10, 25, 12, 0);

function said(id: string, at: Date, author: Message["author"]): TimelineEntry {
  const message = {
    id,
    conversation: "chat",
    author,
    body: id,
    attachments: [],
    sentAt: at.toISOString(),
  };
  return { kind: "message", message };
}

const chief = { kind: "agent", agent: "chief", name: "Chief" } as const;
const liam = { kind: "agent", agent: "liam", name: "Liam" } as const;
const me = { kind: "me" } as const;

/** Each line as one word: the day's label, a message's ID with `^` for a head, or "pending". */
function shape(lines: ReturnType<typeof chatLines>): string[] {
  return lines.map((line) => {
    if (line.kind === "day") return line.label;
    if (line.kind === "message") return line.head ? `^${line.message.id}` : line.message.id;
    return line.kind;
  });
}

/** The messages and pending messages that sit close under the one before them. */
function following(lines: ReturnType<typeof chatLines>): string[] {
  return lines.flatMap((line) => {
    if (line.kind === "message" && line.follows) return [line.message.id];
    if (line.kind === "pending" && line.follows) return [line.pending.body];
    return [];
  });
}

verifies("messenger.chat-transcript", () => {
  describe("chatLines", () => {
    it("labels each day and starts a new run at each new author or day", () => {
      const timeline = [
        said("a", new Date(2026, 10, 23, 9, 0), chief),
        said("b", new Date(2026, 10, 24, 9, 0), chief),
        said("c", new Date(2026, 10, 24, 9, 1), chief),
        said("d", new Date(2026, 10, 25, 9, 0), me),
        said("e", new Date(2026, 10, 25, 9, 1), chief),
      ];
      expect(shape(chatLines(timeline, [{ key: 1, body: "On it" }], now))).toEqual([
        "Mon 23 Nov",
        "^a",
        "Yesterday",
        "^b",
        "c",
        "Today",
        "d",
        "^e",
        "pending",
      ]);
    });

    it("sets each message that goes on a run close under the one before it, the person's too", () => {
      const at = new Date(2026, 10, 25, 9, 0);
      const timeline = [
        said("a", at, chief),
        said("b", at, chief),
        said("c", at, me),
        said("d", at, me),
        said("e", at, chief),
      ];
      const pending = [
        { key: 1, body: "On it" },
        { key: 2, body: "And more" },
      ];
      expect(following(chatLines(timeline, pending, now))).toEqual(["b", "d", "And more"]);
      expect(following(chatLines(timeline.slice(0, 4), pending, now))).toEqual([
        "b",
        "d",
        "On it",
        "And more",
      ]);
    });

    it("in a channel heads every message that isn't the person's", () => {
      const at = new Date(2026, 10, 25, 9, 0);
      const timeline = [said("a", at, liam), said("b", at, liam), said("c", at, me)];
      expect(shape(chatLines(timeline, [], now, true))).toEqual(["Today", "^a", "^b", "c"]);
    });

    it("puts today's label before a pending message in an empty chat", () => {
      expect(shape(chatLines([], [{ key: 1, body: "Hi" }], now))).toEqual(["Today", "pending"]);
      expect(dayLabel(new Date(2026, 10, 24, 23, 59), now)).toBe("Yesterday");
    });
  });
});
