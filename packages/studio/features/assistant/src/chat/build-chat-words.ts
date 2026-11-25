/**
 * The Build chat's words in the panel (microcopy 14.1, 14.3 and 19.5; states H1, H3, H7, H9, H11 to
 * H13, H15, H16, H18 to H20, H22 to H24, H28, H29;
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
  /** The chat tab (flow-assistant 2.3): the panel's ⧉, the tab's way back, and its kind. */
  openAsTab: "Open as tab",
  continueInPanel: "Continue in the side panel",
  chatKind: "Chat",
  /** H6: the tab's side panel, its one view, and its state while nothing is shown yet. */
  items: "Items",
  noItems: "Items the assistant shows or changes appear here.",
  noItemsHint: "Alt+click an agent or workflow in the sidebar to show it.",
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
  /** The item-page chat's placeholder (flow-assistant 1), also for "Ask about this <kind>…" (HAL-18155). */
  itemPlaceholder: (name: string) => `What should change in ${name}?`,
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
  /**
   * The phone's status line after the limit (flow-assistant 11.3): an expected stop, with
   * **Continue** right there. "model call limit" is the glossary's word for "turn limit".
   */
  stoppedAtLimit: "Stopped · model call limit",
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
  /** H22, H23: a failure, with Try again only before a tool ran (H24). */
  failed: (reason: string) => `Couldn't reach the model: ${withoutStop(reason)}.`,
  toolsRan: "Some tool calls already ran. Send a new message to continue.",
  /** After the provider's own sentence for a failed model call (microcopy 14.1 "Model unreachable"). */
  openModels: "Open Models ›",
  /** H11: the chat can't load because the engine doesn't answer yet. */
  engineNotStarted: "The engine isn't answering. It may still be starting.",
  /** H12 (D5): the line at the top of an open chat while the engine doesn't answer. */
  engineNotAnswering: "The engine isn't answering. Showing what it said last.",
  /** H15: the line at the top in a served Studio, and on a phone, while Halonic doesn't answer. */
  serverNotAnswering:
    "Halonic on the server isn't answering. The reply carries on there, and shows here when it's back.",
  computerNotAnswering:
    "Halonic on your computer isn't answering. The reply carries on there, and shows here when it's back.",
  /** H18: neither an Assistant model nor a model alias, with **Settings ›**. */
  noModel:
    "The assistant has no model yet. Add a model alias or choose an Assistant model in Settings › Assistant.",
  /** H18 while Settings hides its Assistant section (HAL-18099), with **Open Models ›**. */
  noModelInModels: "The assistant has no model yet. Add a model alias in Models.",
  openSettings: "Settings ›",
  /** H19: the chat's model needs a key; the model's name sits between the two, as code. */
  noUsableModel: "The assistant has no model it can use:",
  needsKey: (provider: string) => `needs an API key for ${provider}.`,
  setTheKey: "Set the key ›",
  /** H20: a cloud model in a local-only workspace; the Model chip is where to pick another. */
  localOnly: (workspace: string, model: string) =>
    `${workspace} is local only, so the assistant can't use ${model}. Pick a local model.`,
  /** H16: the toast after Not now in the trust check, with Review to open it again. */
  notTrusted: (workspace: string) => `Not started: ${workspace} isn't trusted yet`,
  review: "Review",
  /** H17: under the box of a Build chat on the person's own model while the workspace isn't trusted. */
  authoringOnly: "Not trusted yet · it can read and propose, but not run anything.",
  /** H29: the line itself comes with the held message, from `chatSecretHold` in the shell. */
  goToKeyField: "Go to the key field ›",
  sendAnyway: "Send anyway",
  /** The line of a `show` call that showed its item (UX checklist T14, flow-assistant 3.8). */
  showed: (kind: string, id: string) => `Showed ${kind} ${id}`,
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
