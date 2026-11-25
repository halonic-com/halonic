// The Build chat's write tools (`assistant.build.proposals-change-nothing`,
// AI changes 1.1): `propose_file` and `propose_delete` write at once,
// through `ReviewService`, as changes to review. `propose_file` writes
// through `BuildChat.propose`, which keeps a permission sheet or connector
// to the hosts and sign-ins the person named
// (`assistant.build.named-hosts-secrets`); a delete asks for nothing new.
// A write checks the file is
// still what the model last read in this chat (HAL-3247), and the service
// refuses the paths of `app.assistant-no-git-or-halonic` and
// `app.assistant-untrusted-items-only`; the tool words its answer.

import {
  type ChatTool,
  type ProposalRefusal,
  type ProposeOutcome,
  proposalRefusal,
  type ReviewCard,
} from "@halonicjs/app";
import type { ExpectedContent, ToolCall } from "@halonicjs/ports";
import { type BuildChat, type NotNamed, textArgument, unlessRefused } from "./build-chat.ts";
import { toolTexts } from "./tool-texts.ts";

/** `propose_file`: writes a whole file as a change to review. */
export function proposeFileTool(chat: BuildChat): ChatTool {
  return {
    definition: {
      name: "propose_file",
      description:
        "Writes a whole workspace file at once, as a change the person reviews. Read the file first if it exists.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file's workspace path." },
          content: { type: "string", description: "The whole new text of the file." },
          why: { type: "string", description: "One sentence the person reads on the change." },
        },
        required: ["path", "content", "why"],
      },
    },
    async call(toolCall) {
      const path = textArgument(toolCall.arguments, "path");
      const content = textArgument(toolCall.arguments, "content");
      const start = await startOf(chat, path);
      if ("answer" in start) {
        return start.answer;
      }
      const outcome = await chat.propose({
        path,
        content,
        expected: start.expected,
        card: cardOf(chat, toolCall),
      });
      if (outcome.status === "written") {
        await chat.see(path, content);
        return toolTexts.changed(path);
      }
      return notWritten(path, outcome);
    },
  };
}

/** `propose_delete`: moves a file to Halonic's trash as a change to review. */
export function proposeDeleteTool(chat: BuildChat): ChatTool {
  return {
    definition: {
      name: "propose_delete",
      description:
        "Deletes a workspace file at once, as a change the person reviews. Read the file first.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "The file's workspace path." },
          why: { type: "string", description: "One sentence the person reads on the change." },
        },
        required: ["path", "why"],
      },
    },
    async call(toolCall) {
      const path = textArgument(toolCall.arguments, "path");
      const start = await startOf(chat, path);
      if ("answer" in start) {
        return start.answer;
      }
      if (start.expected === "absent") {
        return deleteOfMissing(chat, path);
      }
      const outcome = await chat.options.review.proposeDelete({
        path,
        expected: start.expected,
        card: cardOf(chat, toolCall),
      });
      if (outcome.status === "written") {
        await chat.see(path, null);
        return toolTexts.deleted(path);
      }
      if (outcome.status === "changed-on-disk" && outcome.current === null) {
        return toolTexts.doesNotExist(path);
      }
      return notWritten(path, outcome);
    },
  };
}

/** What a write starts from: the digest it expects, or the answer that ends it before it starts. */
type Start = { readonly expected: ExpectedContent } | { readonly answer: string };

/**
 * What the write expects the file to hold: what the model last read in
 * this chat. A file the model never read may be created, so a missing one
 * is `"absent"`; one that exists must be read first. A path the assistant
 * may not write is answered before anything is read.
 */
async function startOf(chat: BuildChat, path: string): Promise<Start> {
  const refusal = proposalRefusal(path, chat.options.isTrusted());
  if (refusal !== null) {
    return { answer: refusalText(path, refusal) };
  }
  const seen = chat.seen(path);
  if (seen !== undefined) {
    return { expected: seen };
  }
  const text = await unlessRefused(() => chat.options.files.read(path));
  if (text === "not-allowed") {
    return { answer: toolTexts.cantWrite(path) };
  }
  return text === null ? { expected: "absent" } : { answer: toolTexts.readFirst(path) };
}

/**
 * The answer to a delete of a file the model knows as missing: it doesn't
 * exist, or it does now, so the model reads it first.
 */
async function deleteOfMissing(chat: BuildChat, path: string): Promise<string> {
  const text = await unlessRefused(() => chat.options.files.read(path));
  if (text === "not-allowed") {
    return toolTexts.cantWrite(path);
  }
  return text === null ? toolTexts.doesNotExist(path) : toolTexts.changedSinceRead;
}

/** The answer for a write that wasn't made. */
function notWritten(
  path: string,
  outcome: Exclude<ProposeOutcome | NotNamed, { status: "written" }>,
): string {
  switch (outcome.status) {
    case "not-named":
      return outcome.answer;
    case "changed-on-disk":
      return toolTexts.changedSinceRead;
    case "held":
      return toolTexts.held(path);
    case "refused":
      return refusalText(path, outcome.reason);
  }
}

function refusalText(path: string, reason: ProposalRefusal): string {
  return reason === "untrusted" ? toolTexts.untrustedWrite : toolTexts.cantWrite(path);
}

/** The card of one write: the tool call's id, so the chat finds the card from its tool line. */
function cardOf(chat: BuildChat, toolCall: ToolCall): ReviewCard {
  return { chatId: chat.options.chatId, cardId: toolCall.id };
}
