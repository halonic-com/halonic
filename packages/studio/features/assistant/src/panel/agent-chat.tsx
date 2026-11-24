import {
  AgentOrb,
  type AgentOrbSize,
  type AgentOrbState,
  usePresentation,
} from "@halonicjs/studio-kit";
import type { ChatAgent, ChatKind } from "../api.ts";
import { toolInWords, buildChatWords as words } from "../chat/build-chat-words.ts";
import type { ChatView } from "../chat/build-chats.ts";
import { chatWithWords as agentWords } from "../chat/chat-with-words.ts";
import { turnsOf } from "../chat/turns.ts";

/**
 * The orb of the agent an agent chat talks to (flow-agents 4.3): in the agent's own colours once
 * the agents are read, else in the pair its id picks, so the orb doesn't change as they load.
 */
export function ChatAgentOrb({
  kind,
  agents,
  size,
  state,
}: {
  readonly kind: ChatKind;
  readonly agents: readonly ChatAgent[];
  readonly size: AgentOrbSize;
  readonly state?: AgentOrbState;
}) {
  const colors = agents.find((agent) => agent.kind === kind)?.colors;
  const agentId = kind.slice(kind.lastIndexOf("/") + 1);
  return <AgentOrb agentId={agentId} colors={colors} size={size} state={state} />;
}

/**
 * An agent chat's header line (flow-agents 4.2): the 24px orb with its ring, the agent's name and
 * its state words. It speaks for the agent, so it shows only what this chat knows: thinking,
 * using a tool, replying, else idle. Not a live region: the end of a reply is announced instead.
 */
export function AgentStatusLine({
  agent,
  view,
}: {
  readonly agent: ChatAgent;
  readonly view: ChatView;
}) {
  const { state, words: stateWords } = agentStateOf(view);
  const working = state !== "idle";
  return (
    <div className="flex items-center gap-2 px-4">
      <ChatAgentOrb kind={agent.kind} agents={[agent]} size={24} state={state} />
      <p className="min-w-0 truncate text-small">
        <span className="font-medium text-fg">{agent.name}</span>{" "}
        <span className={working ? "text-running" : "text-fg-muted"}>{stateWords}</span>
      </p>
    </div>
  );
}

/** What the agent is doing in this chat, as its orb's ring and its words. */
export function agentStateOf(view: ChatView): {
  readonly state: AgentOrbState;
  readonly words: string;
} {
  if (!view.answering) return { state: "idle", words: agentWords.state.idle };
  if (view.tool !== undefined) {
    return { state: "tool", words: agentWords.state.tool(toolInWords(view.tool.name)) };
  }
  // Once the reply has text, the agent is replying; before that, it's thinking.
  const last = turnsOf(view.messages, view.ends, view.answering).at(-1);
  const replying = last?.steps.some((step) => step.kind === "text") === true;
  return replying
    ? { state: "talk", words: agentWords.state.talk }
    : { state: "think", words: agentWords.state.think };
}

/**
 * The panel's empty chat (flow-assistant 6.1), at the top of the transcript, as the panel doesn't
 * centre: "What should we build?" with its line, or for an agent chat the agent's 64px character
 * above "Chat with Triage" and the agent's description. On a phone the Build chat's start is in
 * the middle of the transcript, its heading in `text-heading`, with no halo and no glow
 * (flow-assistant 11.5): the composer stays at the bottom, on the keyboard.
 */
export function PanelChatStart({ agent }: { readonly agent: ChatAgent | undefined }) {
  const centred = usePresentation() === "phone" && agent === undefined;
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-1 px-4 py-3 ${centred ? "justify-center text-center" : ""}`}
    >
      {agent === undefined ? null : (
        <div className="mb-2">
          <ChatAgentOrb kind={agent.kind} agents={[agent]} size={64} />
        </div>
      )}
      <h3 className={`${centred ? "text-heading" : "text-section"} text-fg`}>
        {agent === undefined ? words.heading : agentWords.heading(agent.name)}
      </h3>
      <p className="text-body text-fg-muted">
        {agent === undefined ? words.startLine : agent.description}
      </p>
    </div>
  );
}
