import type { MessagingAgent } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { pictureMembers } from "./channel.ts";
import type { ConversationRow } from "./messenger.ts";

function agent(id: string, name: string): MessagingAgent {
  return { id, source: "acme", name, activity: "idle" };
}

const chief = agent("a1", "Chief");
const elena = agent("a2", "Elena");
const liam = agent("a3", "Liam");

/** Acme's channel Engineering, led by `lead`, with the members its source still lists. */
function engineering(lead: string, members: readonly MessagingAgent[]): ConversationRow {
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
    sourceAgents: members,
    source: undefined,
  };
}

verifies("messenger.channel-picture", () => {
  describe("who a channel's picture shows", () => {
    it("puts the lead in front and the first other member listed behind", () => {
      expect(pictureMembers(engineering(chief.id, [elena, chief, liam]))).toEqual({
        front: chief,
        behind: elena,
      });
    });

    it("puts the first member listed in front once the lead has left", () => {
      expect(pictureMembers(engineering("gone", [elena, liam]))).toEqual({
        front: elena,
        behind: liam,
      });
    });

    it("shows one listed member alone, and nobody while none is listed", () => {
      expect(pictureMembers(engineering(chief.id, [chief]))).toEqual({
        front: chief,
        behind: undefined,
      });
      expect(pictureMembers(engineering("gone", [elena]))).toEqual({
        front: elena,
        behind: undefined,
      });
      expect(pictureMembers(engineering(chief.id, []))).toBeUndefined();
    });
  });
});
