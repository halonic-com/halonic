/**
 * The Try it chat's words (microcopy 8.3 and 19.5; states H2, H9, H12, H13, H23, H24). The agent's
 * name is the one it has now.
 */
export const tryItWords = {
  /** H2: the empty chat's heading. */
  heading: (agent: string) => `Chat with ${agent}`,
  /** The box's name and its placeholder. */
  boxLabel: (agent: string) => `Message ${agent}`,
  placeholder: (agent: string) => `Message ${agent}…`,
  /** The transcript's name. */
  transcript: (agent: string) => `Chat with ${agent}`,
  /** Each reply's hidden heading. */
  said: (agent: string) => `${agent} said`,
  /** Announced when a reply ends. */
  replied: (agent: string) => `${agent} replied.`,
  stoppedByYou: "Stopped by you.",
  /** H23: a failure with no sentence of its own for its reason. */
  replyFailed: (agent: string, reason: string) =>
    `${agent}'s reply failed: ${withoutStop(reason)}.`,
  /** H24: after a failure once a tool ran; there's no Try again then. */
  toolsRan: "Some tool calls already ran. Send a new message to continue.",
  /** H13: the engine stopped while it answered. */
  engineStopped: "Stopped when Halonic's engine stopped.",
  /** H12: the line at the top while the engine doesn't answer. */
  engineNotAnswering: "The engine isn't answering. Showing what it said last.",
  /** After v0.1 a turn limit is a run's; until then a chat that runs out says so plainly. */
  turnLimit: (agent: string, turns: number) =>
    `${agent} used all ${turns} turns without finishing.`,
  tryAgain: "Try again",
  /** H29: a message that looks like it holds a key isn't sent (flow-assistant 5.9, HAL-1625). */
  keyInMessage:
    "This looks like an API key. Keys go in the key field, so they stay out of chats and files.",
  goToKeyField: "Go to the key field ›",
  sendAnyway: "Send anyway",
  /** H27: the harness line's way to fix it. */
  openHarness: "Open Harness settings ›",
  /** A tool call's line, with the tool's name in words: "send reply". */
  tool: {
    running: (tool: string) => `Using ${tool}…`,
    done: (tool: string) => `Used ${tool}`,
    failed: (tool: string) => `${capitalised(tool)} didn't work`,
  },
} as const;

/**
 * A tool's name in words (flow-agents 4.2): the connector's prefix dropped and `_` to spaces, so
 * `acme-mail__send_reply` reads "send reply".
 */
export function toolInWords(name: string): string {
  const own = name.includes("__") ? name.slice(name.lastIndexOf("__") + 2) : name;
  return own.replaceAll("_", " ").trim();
}

/** A reason without its own full stop, so the sentence around it ends with one. */
function withoutStop(reason: string): string {
  return reason.trim().replace(/\.+$/, "");
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
