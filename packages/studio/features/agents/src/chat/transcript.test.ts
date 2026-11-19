import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  emptyTranscript,
  endTurn,
  startTurn,
  withMessage,
  withoutLastTurn,
  withToolCall,
} from "./transcript.ts";
import { toolInWords, tryItWords } from "./try-it-words.ts";

verifies("agents.chat.try-it", () => {
  it("names a tool in words, without its connector", () => {
    expect(toolInWords("acme-mail__send_reply")).toBe("send reply");
    expect(toolInWords("search_pages")).toBe("search pages");
    expect(tryItWords.tool.failed(toolInWords("send_reply"))).toBe("Send reply didn't work");
  });

  it("marks a tool call failed when its result is the chat service's error", () => {
    const call = { id: "c1", name: "send_reply", arguments: {} };
    let transcript = withToolCall(startTurn(emptyTranscript, "Reply to Sam"), call);
    transcript = withMessage(transcript, {
      role: "tool",
      content: "Error: the mailbox is full",
      toolCallId: "c1",
      name: "send_reply",
    });
    expect(transcript.turns[0]?.steps).toEqual([
      { kind: "tool", callId: "c1", name: "send_reply", state: "failed" },
    ]);
  });
});

verifies("agents.chat.reply-ends", () => {
  it("takes back the last turn and the conversation from its message on", () => {
    let transcript = startTurn(emptyTranscript, "Sort this mail");
    transcript = withMessage(transcript, { role: "assistant", content: "Refunds." });
    transcript = endTurn(startTurn(endTurn(transcript, { kind: "answered" }), "And this?"), {
      kind: "failed",
      reason: "busy",
      toolsRan: false,
    });
    const back = withoutLastTurn(transcript);
    expect(back.message).toBe("And this?");
    expect(back.transcript.turns).toHaveLength(1);
    expect(back.transcript.conversation).toEqual([
      { role: "user", content: "Sort this mail" },
      { role: "assistant", content: "Refunds." },
    ]);
    expect(withoutLastTurn(emptyTranscript).message).toBeUndefined();
  });
});
