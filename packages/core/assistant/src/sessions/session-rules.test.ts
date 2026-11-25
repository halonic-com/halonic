import type { ChatMessage, SavedChat } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  chatsToDrop,
  chatToSave,
  isDraft,
  recentFirst,
  restoredChat,
  shortenToolResults,
  titleAfterSend,
  titleFromFirstMessage,
} from "./session-rules.ts";

function chat(id: string, lastUsedAt: string, kind: SavedChat["kind"] = "build"): SavedChat {
  return {
    id,
    kind,
    title: `Chat ${id}`,
    lastUsedAt,
    answering: false,
    model: { kind: "assistant" },
    messages: [{ role: "user", content: `Chat ${id}` }],
  };
}

/** Minute `minute` of 23 Nov 2026, in UTC. */
const at = (minute: number) => new Date(Date.UTC(2026, 10, 23, 0, minute)).toISOString();

verifies("assistant.sessions.draft-until-first-message", () => {
  it("never saves a chat before the person's first message", () => {
    const draft = { ...chat("c-1", at(0)), messages: [] };
    expect(isDraft(draft.messages)).toBe(true);
    expect(chatToSave(draft)).toBeNull();
    const system: ChatMessage[] = [{ role: "system", content: "You build workspaces." }];
    expect(chatToSave({ ...draft, messages: system })).toBeNull();
  });

  it("saves the chat once it has a message", () => {
    const sent = {
      ...chat("c-1", at(0)),
      messages: [{ role: "user" as const, content: "Add a skill" }],
    };
    expect(isDraft(sent.messages)).toBe(false);
    expect(chatToSave(sent)).toEqual(sent);
  });

  it("keeps the item a chat is about when it is saved and restored", () => {
    const about: SavedChat = {
      ...chat("c-1", at(0)),
      about: { kind: "workflow", hub: "support", id: "triage" },
    };
    expect(chatToSave(about)?.about).toEqual(about.about);
    expect(restoredChat(about).chat.about).toEqual(about.about);
  });
});

verifies("assistant.sessions.title-from-first-message", () => {
  it("takes the first line with text, spaces collapsed", () => {
    expect(titleFromFirstMessage("  Add a routine\nthat runs daily")).toBe("Add a routine");
    expect(titleFromFirstMessage("\n \r\nFix   the\ttriage  alias")).toBe("Fix the triage alias");
  });

  it("cuts a line longer than 60 characters to 57 and …", () => {
    expect(titleFromFirstMessage("x".repeat(80))).toBe(`${"x".repeat(57)}…`);
    expect(titleFromFirstMessage("y".repeat(60))).toBe("y".repeat(60));
    expect(titleFromFirstMessage("z".repeat(61))).toBe(`${"z".repeat(57)}…`);
    // A character outside the BMP counts once and is never split.
    expect(titleFromFirstMessage("😀".repeat(70))).toBe(`${"😀".repeat(57)}…`);
  });

  it("stays New chat for a message of only spaces", () => {
    expect(titleFromFirstMessage("   \n\t ")).toBe("New chat");
  });

  it("titles a chat still called New chat or New session, and keeps any other title", () => {
    expect(titleAfterSend("New chat", "Add a routine")).toBe("Add a routine");
    expect(titleAfterSend("New session", "Add a routine")).toBe("Add a routine");
    expect(titleAfterSend("Routines", "Add another")).toBe("Routines");
  });
});

verifies("assistant.sessions.keep-newest-40", () => {
  it("drops the chats after the 40 most recently used", () => {
    const chats = Array.from({ length: 42 }, (_, minute) => chat(`c-${minute}`, at(minute)));
    expect(chatsToDrop(chats)).toEqual(["c-1", "c-0"]);
    expect(chatsToDrop(chats.slice(0, 40))).toEqual([]);
  });

  it("counts Build and agent chats in one list", () => {
    const build = Array.from({ length: 40 }, (_, minute) => chat(`b-${minute}`, at(minute + 1)));
    const agent = chat("a-1", at(0), "agent:support/triage");
    expect(chatsToDrop([agent, ...build])).toEqual(["a-1"]);
  });

  it("brings a chat that was answering back not busy, with its messages, stopped when Halonic closed", () => {
    const saved: SavedChat = {
      ...chat("c-1", at(0)),
      title: "New session",
      answering: true,
      messages: [
        { role: "user", content: "Add a routine" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "t1", name: "list_files", arguments: {} }],
        },
      ],
    };
    const restored = restoredChat(saved);
    expect(restored.stoppedWhenClosed).toBe(true);
    expect(restored.chat).toEqual({ ...saved, title: "New chat", answering: false });
    expect(restoredChat(chat("c-2", at(0)))).toEqual({
      chat: chat("c-2", at(0)),
      stoppedWhenClosed: false,
    });
  });
});

verifies("assistant.sessions.shorten-long-tool-results", () => {
  const long = "a".repeat(10_000);
  const messages: ChatMessage[] = [
    { role: "user", content: long },
    {
      role: "assistant",
      content: long,
      toolCalls: [
        { id: "t1", name: "read_file", arguments: { path: "a.yaml" } },
        { id: "t2", name: "propose_file", arguments: { path: "b.yaml", content: long } },
      ],
    },
    { role: "tool", content: long, toolCallId: "t1", name: "read_file" },
    { role: "tool", content: "b".repeat(300), toolCallId: "t2", name: "propose_file" },
  ];

  it("cuts a tool result over 4,000 characters and marks the cut", () => {
    const saved = shortenToolResults(messages);
    expect(saved[2]).toEqual({ ...messages[2], content: `${"a".repeat(4000)}\n… (cut)` });
    expect(saved[3]).toEqual(messages[3]);
  });

  it("keeps the person's messages, the replies and a proposal's whole content", () => {
    const saved = chatToSave({ ...chat("c-1", at(0)), messages });
    expect(saved?.messages.slice(0, 2)).toEqual(messages.slice(0, 2));
    expect(
      shortenToolResults([{ role: "tool", content: "c".repeat(4000), toolCallId: "t", name: "x" }]),
    ).toEqual([{ role: "tool", content: "c".repeat(4000), toolCallId: "t", name: "x" }]);
  });

  it("gives the same history when a saved chat is saved again", () => {
    const once = shortenToolResults(messages);
    expect(shortenToolResults(once)).toEqual(once);
  });
});

verifies("assistant.sessions.recent-first", () => {
  it("lists the most recently used first, comparing times as times", () => {
    const a = chat("a", "2026-11-05T10:00:00.000Z");
    const b = chat("b", "2026-11-05T11:00:00.000Z");
    expect([a, b].sort(recentFirst).map((each) => each.id)).toEqual(["b", "a"]);
    const local = chat("a", "2026-11-05T11:30:00.000+02:00");
    const utc = chat("b", "2026-11-05T10:00:00.000Z");
    expect([local, utc].sort(recentFirst).map((each) => each.id)).toEqual(["b", "a"]);
  });

  describe("chats used at the same time, or at a time that can't be read", () => {
    it("orders them by id", () => {
      const same = [chat("c", at(0)), chat("a", at(0)), chat("b", "not a time")];
      expect(same.sort(recentFirst).map((each) => each.id)).toEqual(["a", "b", "c"]);
    });
  });
});
