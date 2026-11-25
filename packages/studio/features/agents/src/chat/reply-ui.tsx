import {
  type ChatComponentName,
  chatLibrary,
  OpenUiStream,
  readOpenUi,
} from "@halonicjs/openui-lang";
import { ChatText, ChatUi, type ChatUiSend } from "@halonicjs/studio-kit";
import { useMemo } from "react";

/** What a reply's text step needs to draw the components its agent may use. */
export interface ReplyUi {
  /** The components the agent's `chatUi` lists. */
  readonly components: readonly ChatComponentName[];
  /** The agent's name, for the "couldn't be shown" line. */
  readonly sender: string;
  /** Sends a button's words or a form's answers; only the newest reply that ended has it. */
  readonly onSend: ChatUiSend;
  /** The message the person sent after this reply, so its controls show as a record. */
  readonly answered: string | undefined;
  /** The reply ended, so its text is read whole rather than as far as it got. */
  readonly ended: boolean;
}

/** A reply's text cut around the components it draws. */
export interface ReplyParts {
  readonly before: string;
  /** From the line that starts `root =`, or the fence it sits in, to that fence's end. */
  readonly program: string;
  readonly after: string;
}

const ROOT_LINE = /^\s*root\s*=/;
const FENCE_LINE = /^\s*```/;

/**
 * Finds the components in a reply's text: the program from the line that starts `root =` (the
 * prompt tells the model to start there), or from the fence it opens in to the fence that closes
 * it, with the words before and after it. `undefined` when the text has no such line.
 */
export function replyPartsOf(text: string): ReplyParts | undefined {
  const lines = text.split("\n");
  const rootAt = lines.findIndex((line) => ROOT_LINE.test(line));
  if (rootAt < 0) return undefined;
  const fences = lines.flatMap((line, index) => (FENCE_LINE.test(line) ? [index] : []));
  const fencesBefore = fences.filter((index) => index < rootAt);
  // An odd number of fences before the root line leaves one open: the program is inside it.
  const fenceAt = fencesBefore.length % 2 === 1 ? fencesBefore.at(-1) : undefined;
  const start = fenceAt ?? rootAt;
  const closeAt = fenceAt === undefined ? undefined : fences.find((index) => index > rootAt);
  const end = closeAt === undefined ? lines.length : closeAt + 1;
  return {
    before: lines.slice(0, start).join("\n").trim(),
    program: lines.slice(start, end).join("\n"),
    after: lines.slice(end).join("\n").trim(),
  };
}

/**
 * One text step of a reply. With the agent's `chatUi` on, the components it holds are drawn
 * between its words; with it off, or with none in it, the text shows as it was written.
 */
export function ReplyText({ text, ui }: { readonly text: string; readonly ui?: ReplyUi }) {
  const parts = ui === undefined ? undefined : replyPartsOf(text);
  const program = parts?.program;
  const components = ui?.components;
  const ended = ui?.ended === true;
  const result = useMemo(() => {
    if (program === undefined || components === undefined) return undefined;
    const library = chatLibrary(components);
    // While the reply is written, what's still open is closed for now rather than shown as broken.
    return ended ? readOpenUi(program, library) : new OpenUiStream(library).push(program);
  }, [program, components, ended]);
  if (parts === undefined || ui === undefined || result === undefined) {
    return <ChatText>{text}</ChatText>;
  }
  return (
    <>
      {parts.before === "" ? null : <ChatText>{parts.before}</ChatText>}
      <ChatUi
        result={result}
        source={parts.program}
        sender={ui.sender}
        onSend={ui.onSend}
        answered={ui.answered}
      />
      {parts.after === "" ? null : <ChatText>{parts.after}</ChatText>}
    </>
  );
}
