/**
 * Every word the quick-ask box shows or says, copied from the approved design (HAL-18594,
 * sections 4–7). "Quick ask" is the working name until the chosen one replaces it everywhere.
 */
export const quickAskWords = {
  /** The app's name, first in its window's title. */
  name: "Quick ask",
  /** The box's name for screen readers. */
  label: "Ask an agent",
  /** The text box's placeholder, before the agent has answered. */
  placeholder: (agent: string) => `Ask ${agent} anything`,
  /** The text box's placeholder once the agent has answered: the next question is a reply. */
  reply: (agent: string) => `Reply to ${agent}`,
  /** The agent button's name for screen readers. */
  agentButton: (agent: string) => `Ask ${agent}. Change agent.`,
  /** The button that sends. */
  ask: "Ask",
  /** The hint row: each key, then what it does. */
  hints: [
    { key: "Enter", does: "ask" },
    { key: "Tab", does: "another agent" },
    { key: "Esc", does: "close" },
  ],
  /** The picker's search box. */
  findAgent: "Find an agent",
  /** In place of the picker's list when no agent's name holds the text (the Agents list's words). */
  noMatch: (text: string) => `No agents match "${text}".`,
  /** The picker's first group: the agents asked or chatted with most recently. */
  recent: "Recent",
  /**
   * The picker's group for agents whose workspace or team isn't connected any more, so has no name
   * to group them under. The team chose these words (HAL-18997); the design has none for this case.
   */
  noSource: "No longer connected",
  /** The working line while the agent works on the question. */
  working: (agent: string) => `${agent} is working`,
  /** Under the question while it waits: the box can close, the answer isn't lost. */
  canClose: (agent: string) => `You can close this. The answer comes to your chat with ${agent}.`,
  /**
   * The hint row's link to an answer that came after the box closed: "Last answer: Liam, 13:41". The
   * link draws its "›" after these words, hidden from screen readers.
   */
  lastAnswer: (agent: string, time: string) => `Last answer: ${agent}, ${time}`,
  /** Copies the answer's text. */
  copy: "Copy",
  /** What Copy did, in a status line: the kit's CopyButton's own words. */
  copied: "Copied",
  notCopied: "Couldn't copy. Select the text and copy it yourself.",
  /** Next to Copy: carries the conversation on in its Messenger chat. */
  openInMessenger: "Open in Messenger",
  /** The answer holds a card, which is answered in Messenger, not in the box. */
  cardAsks: (agent: string) => `${agent} asks you to choose`,
  /** Under the card's question: opens its chat in Messenger, where the card is answered. */
  answerInMessenger: "Answer in Messenger",
  /** On a question that didn't go out (motion 4's words). */
  notSent: "Not sent",
  tryAgain: "Try again",
  /** Under a question that didn't go out. */
  unreachable: (source: string) => `Couldn't reach ${source}. Your question is still here.`,
  /** Said to screen readers while the box reads the agents to ask, as Messenger's "Loading your chats". */
  loading: "Loading your agents",
  /** No agent to ask yet. */
  noAgents: "No agents yet",
  noAgentsHint: "Connect a workspace or a team in Studio to ask its agents.",
  openStudio: "Open Studio",
} as const;
