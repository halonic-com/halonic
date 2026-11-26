import { agentTint } from "../../src/avatar/agent-tint.ts";
import { AuthorLine } from "../../src/avatar/author-line.tsx";
import { Avatar } from "../../src/avatar/avatar.tsx";
import type { PartSection } from "../state-table.tsx";

/** Six made-up agents, one per tint. */
const agents = ["agent-0", "agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];

export const avatarSection: PartSection = {
  id: "avatar",
  number: "26.6",
  name: "Avatar",
  order:
    "kit 26.6 · left to right: two words, one word, an empty name; then an agent's tints; then the author line",
  notApplicable: "hover, focus, disabled (decoration, not interactive)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <>
          <Avatar name="Sofia Marin" />
          <Avatar name="Sofia" />
          <Avatar name="" />
        </>
      ),
    },
    {
      name: "On a muted row",
      copies: () => (
        <span className="flex gap-2 rounded-md bg-surface-muted p-2">
          <Avatar name="Sofia Marin" />
          <Avatar name="Sofia Marin" size="header" />
        </span>
      ),
    },
    {
      name: "Agent tint",
      copies: () => (
        <>
          {agents.map((agent) => (
            <Avatar key={agent} name="Acme Bot" tint={agentTint(agent)} />
          ))}
        </>
      ),
    },
    {
      name: "Author line",
      copies: () => (
        <>
          <AuthorLine name="Acme Bot" time="09:00" tint={agentTint("agent-0")} />
          <AuthorLine name="Sofia Marin" time="Yesterday" />
        </>
      ),
    },
  ],
};
