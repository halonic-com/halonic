import type { ReplyEnd } from "./transcript.ts";

/** A reply end that gets a `danger` line. */
type BadEnd = Extract<ReplyEnd, { readonly kind: "failed" | "engine-stopped" }>;

/**
 * The Try it chat's words (microcopy 8.3, 14.1 and 19.5; states H2, H9, H12, H13, H16, H19,
 * H21, H23, H24). The agent's name is the one it has now.
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
  /**
   * The whole line for a reply that failed or stopped with the engine: its cause, then H24's
   * sentence once a tool ran. The screen and the announcement say the same (C505-4).
   */
  endedBadly: (agent: string, end: BadEnd): string => {
    const cause =
      end.kind === "failed" ? tryItWords.replyFailed(agent, end.reason) : tryItWords.engineStopped;
    return end.toolsRan ? `${cause} ${tryItWords.toolsRan}` : cause;
  },
  /** H12: the line at the top while the engine doesn't answer. */
  engineNotAnswering: "The engine isn't answering. Showing what it said last.",
  /**
   * After v0.1 a model call limit is a run's; until then a chat that runs out says so plainly.
   * "used all 1 model calls" reads like a bug, so a limit of 1 says it as the CLI does (HAL-15314).
   */
  turnLimit: (agent: string, turns: number) =>
    turns === 1
      ? `${agent} used its only model call without finishing.`
      : `${agent} used all ${turns} model calls without finishing.`,
  tryAgain: "Try again",
  /** A failure for the model's key: the run page's way to Models (microcopy 15.3), as a chat link. */
  openModels: "Open Models ›",
  /** The untrusted toast's way back to the trust check, as the status bar's badge says it. */
  review: "Review",
  /** H16: the toast after Not now in the trust gate, or where there is no gate to open. */
  notTrusted: (workspace: string | undefined) =>
    `Not started: ${workspace ?? "this workspace"} isn't trusted yet`,
  /** H29: the line itself comes with the held message, from `chatSecretHold` in the shell. */
  goToKeyField: "Go to the key field ›",
  sendAnyway: "Send anyway",
  /** H19: the agent's model needs a key; the model's name goes between, as code. */
  noUsableModel: (agent: string) => `${agent} has no model it can use:`,
  needsKey: (provider: string) => `needs an API key for ${provider}.`,
  setTheKey: "Set the key ›",
  /** H21: the budget line's way to Workspace settings › Budget; the line is the Inbox's notice. */
  changeBudget: "Change budget",
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
