import type { Message, MessageWork, MessagingAgent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { pickable, pickerQuery, toLine, withoutQuery, workLines } from "./channel.ts";
import type { ConversationRow } from "./messenger.ts";

function agent(id: string, name: string): MessagingAgent {
  return { id, source: "acme", name, activity: "idle" };
}

const chief = agent("a1", "Chief");
const elena = agent("a2", "Elena");
const liam = agent("a3", "Liam");
const owen = agent("a4", "Owen");
const writer = agent("a5", "Writer");

/** Engineering, a channel of five with Chief as its lead. */
function engineering(lead = chief.id): ConversationRow {
  const members = [chief, elena, liam, owen, writer];
  return {
    conversation: {
      id: "c1",
      source: "acme",
      agent: lead,
      members: members.map((each) => each.id),
      title: "Engineering",
      updatedAt: "2026-11-25T10:00:00.000Z",
      waitingForMe: false,
    },
    agents: members,
    // Gone left the channel but is still in the source; anyone else isn't listed at all.
    sourceAgents: [...members, agent("a6", "Gone")],
    source: undefined,
  };
}

function sent(work: readonly MessageWork[]): Message {
  return {
    id: "m1",
    conversation: "c1",
    author: { kind: "me" },
    body: "Can someone check the build?",
    attachments: [],
    sentAt: "2026-11-25T10:00:00.000Z",
    work,
  };
}

const since = "2026-11-25T10:00:00.000Z";
const now = new Date("2026-11-25T10:04:30.000Z");

verifies("messenger.channel-messages", () => {
  describe("toLine", () => {
    it("says the lead answers while nobody is named (K2)", () => {
      expect(toLine(engineering(), [])).toEqual({
        text: "To Chief (lead) · Type @ to ask someone else",
      });
    });

    it("names the picked agents instead", () => {
      expect(toLine(engineering(), [elena.id]).text).toBe("To Elena");
      expect(toLine(engineering(), [elena.id, liam.id]).text).toBe("To Elena and Liam");
    });

    it("says Send waits when the lead is gone and nobody is named", () => {
      expect(toLine(engineering("gone"), [])).toEqual({
        text: "To nobody yet",
        waits: "Name someone with @, or pick a lead in Members.",
      });
    });
  });

  describe("the @ picker", () => {
    it("opens only on an @ being typed at the end of the box", () => {
      expect(pickerQuery("@")).toBe("");
      expect(pickerQuery("ask @Li")).toBe("Li");
      expect(pickerQuery("@Liam please look")).toBeUndefined();
      expect(pickerQuery("mail@example")).toBeUndefined();
    });

    it("offers the members not named yet whose name holds what's typed", () => {
      expect(pickable(engineering(), "E", [elena.id]).map((each) => each.name)).toEqual([
        "Chief",
        "Owen",
        "Writer",
      ]);
      expect(withoutQuery("ask @Li")).toBe("ask ");
    });
  });

  describe("workLines", () => {
    it("shows each of the six states with its symbol and words", () => {
      const message = sent([
        { agent: elena.id, state: "starting", since },
        { agent: liam.id, state: "working", since },
        { agent: owen.id, state: "answered", since },
        { agent: chief.id, state: "asks-you", work: "w1", since },
        { agent: writer.id, state: "failed", since },
        { agent: chief.id, state: "passed-on", passedTo: liam.id, since },
        { agent: owen.id, state: "other", since },
      ]);
      const questions = new Map([["w1", "Which hostname?"]]);
      expect(workLines(message, engineering(), questions, now)).toEqual([
        { symbol: "◔", text: "Elena · starting…" },
        { symbol: "◔", text: "Liam · working · 4 min" },
        { symbol: "✓", text: "Owen answered" },
        { symbol: "!", text: "Chief asks you: Which hostname?" },
        { symbol: "✕", text: "Writer's task was closed without an answer." },
        { symbol: "→", text: "Chief passed this to Liam" },
      ]);
    });

    it("stops after 3 hand-offs (K3)", () => {
      const handOff = (from: string, to: string): MessageWork => ({
        agent: from,
        state: "passed-on",
        passedTo: to,
        since,
      });
      const message = sent([
        handOff(chief.id, liam.id),
        handOff(liam.id, elena.id),
        handOff(elena.id, owen.id),
      ]);
      expect(workLines(message, engineering(), new Map(), now).at(-1)).toEqual({
        symbol: "✕",
        text: "Stopped after 3 hand-offs. Name who should answer.",
      });
    });

    it("shows no line for an agent the source doesn't list, or a hand-off to nobody known", () => {
      const message = sent([
        { agent: "unlisted", state: "starting", since },
        { agent: chief.id, state: "passed-on", since },
        { agent: chief.id, state: "passed-on", passedTo: "unlisted", since },
        { agent: "a6", state: "answered", since },
      ]);
      expect(workLines(message, engineering(), new Map(), now)).toEqual([
        { symbol: "✓", text: "Gone answered" },
      ]);
    });
  });
});
