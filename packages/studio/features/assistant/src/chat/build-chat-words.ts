/**
 * The Build chat's words in the panel (microcopy 14.1 and 19.5; states H1, H3, H7, H9, H28;
 * flow-assistant 2.2, 3.6 and 5.1). Where flow-assistant and the microcopy differ, the microcopy
 * wins: the limit is "model calls" since its revision 117 (HAL-14707).
 */
export const buildChatWords = {
  /** The panel's region name, whatever the chat's title is (L12). */
  panel: "Assistant",
  newChat: "New chat",
  close: "Close",
  /** H1: an empty chat's heading and the line under it, at the top of the panel's transcript. */
  heading: "What should we build?",
  startLine: "I make changes in your files and mark them; you accept or reject each one.",
  /** H3: the panel when its chat is gone. */
  noChat: "No chat open",
  noChatLine:
    "Ask the assistant for a change. It makes it in your files and marks it; you accept or reject each one.",
  /** H7: what screen readers hear while a chat first loads. */
  loading: "Loading this chat",
  cantLoad: "Couldn't load this chat",
  tryAgain: "Try again",
  transcript: "Chat with the assistant",
  /** Each reply's hidden heading. */
  said: "The assistant said",
  boxLabel: "Message the assistant",
  placeholder: "Ask for a change…",
  /** The status line while it answers: H9 before the first word, then the tool it runs. */
  thinking: "Running · thinking",
  reading: (file: string) => `Running · reading ${file}`,
  /** Each Build chat tool in its own words (Sofia, HAL-16933); `using` for any other tool. */
  listing: "Running · listing files",
  checkingSchema: "Running · checking the schema",
  changing: (file: string | undefined) => `Running · changing ${file ?? "a file"}`,
  deleting: (file: string | undefined) => `Running · deleting ${file ?? "a file"}`,
  checkingWorkspace: "Running · checking the workspace",
  showing: "Running · showing an item",
  using: (tool: string) => `Running · using ${tool}`,
  /** The status line while it waits: the page the window shows, as its tab names it. */
  lookingAt: (page: string) => `Looking at: ${page}`,
  /** Show in chat and the shown items under the status line (flow-assistant 5.7, AS 2.2). */
  showInChat: "Show in chat",
  shown: "Shown:",
  removeShown: (name: string) => `Remove ${name} from this chat`,
  moreShown: (count: number) => `+${count}`,
  /** The status line after Stop, without the line's full stop (flow-assistant 2.2). */
  stopped: "Stopped by you",
  stoppedByYou: "Stopped by you.",
  stoppedWhenClosed: "Stopped when Halonic closed.",
  /** H13 (D4): the engine stopped mid-answer, with Try again unless a tool already ran. */
  engineStopped: "Stopped when Halonic's engine stopped.",
  /** H28: the limit's line, with **Continue**, and what is announced. */
  modelCallLimit: (calls: number) => `Stopped after ${calls} model calls. Ask it to continue.`,
  continue: "Continue",
  /** The link under a Build chat's box (flow-assistant 5.10): the workspace has no own skill, or has one. */
  customizeSkill: "customize skill",
  editSkill: "edit skill",
  /** Announced once when an answer ends; the count only when there are items to review. */
  answerFinished: (itemsToReview: number) =>
    itemsToReview === 0
      ? "Answer finished."
      : `Answer finished. ${itemsToReview} ${itemsToReview === 1 ? "item" : "items"} to review.`,
  /** A failure; PR 7 gives each cause its own sentence and Try again (H18 to H24). */
  failed: (reason: string) => `Couldn't reach the model: ${withoutStop(reason)}.`,
  toolsRan: "Some tool calls already ran. Send a new message to continue.",
  /** A tool call's line, with the tool's name in words: "read file". */
  tool: {
    running: (tool: string) => `Using ${tool}…`,
    done: (tool: string) => `Used ${tool}`,
    failed: (tool: string) => `${capitalised(tool)} didn't work`,
  },
} as const;

/** A tool's name in words, as the Try it chat says it: `read_file` reads "read file". */
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
