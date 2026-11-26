import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { askableAgents } from "../ask-session.ts";
import { agent, chat } from "../test-support/fake-messenger.ts";
import { pickerGroups } from "./picker-groups.ts";

/** A chat with `name` in the team called `team`. */
function inTeam(name: string, team: string) {
  const row = chat(agent(name));
  return { ...row, source: row.source && { ...row.source, label: team } };
}

const agents = askableAgents([
  chat(agent("Chief")),
  inTeam("Liam", "Paperclip · Globex"),
  chat(agent("Noah")),
  chat(agent("Elena")),
  inTeam("Julian", "Paperclip · Globex"),
]);

function shown(query: string) {
  return pickerGroups(agents, query).map((group) => [
    group.label,
    group.agents.map((each) => each.agent.name),
  ]);
}

verifies("quick-ask.box", () => {
  it("puts the three newest chats under Recent, then each workspace and team once", () => {
    expect(shown("")).toEqual([
      ["Recent", ["Chief", "Liam", "Noah"]],
      ["Paperclip · Acme", ["Elena"]],
      ["Paperclip · Globex", ["Julian"]],
    ]);
  });

  it("narrows to the names holding the text, under their own workspace, without Recent", () => {
    expect(shown(" LI ")).toEqual([["Paperclip · Globex", ["Liam", "Julian"]]]);
    expect(shown("zed")).toEqual([]);
  });
});
