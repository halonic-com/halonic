// One reply in a Build chat's transcript: its steps in order, then the line it ended with and what
// that line offers (states H13, H22 to H24, flow-assistant 3.6).

import {
  type ButtonUnavailable,
  type ChatAction,
  ChatEndLine,
  ChatMessage,
  ChatText,
  ChatToolLine,
} from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { ProposalCard } from "../cards/proposal-card.tsx";
import { DocsCall } from "../cards/site-card.tsx";
import { toolInWords, buildChatWords as words } from "../chat/build-chat-words.ts";
import { endLine, providerSentence, type ReplyStep, type Turn } from "../chat/turns.ts";
import { openModelsCommand } from "./model-line.tsx";

/** Where a reply's cards belong: their chat and the workspace. */
interface CardPlace {
  readonly chatId: string;
  readonly context: WorkspaceContext;
}

/**
 * A reply as far as it got. Only the last one offers Continue or Try again; a failed model call
 * with the provider's own sentence adds **Open Models ›**.
 */
export function Reply({
  turn,
  place,
  onContinue,
  waits,
}: {
  readonly turn: Turn;
  readonly place: CardPlace;
  readonly onContinue: (() => void) | undefined;
  readonly waits: ButtonUnavailable | undefined;
}) {
  const end = turn.end;
  // Only the last reply offers Continue or Try again: each carries on that answer without a new
  // message (flow-assistant 3.6), which sends the last message again when nothing ran (H13, H22,
  // H23). After a tool ran there is no Try again, since a tool may have sent something (H24).
  const actions = onContinue === undefined ? [] : endActions(end, onContinue, waits);
  // The provider's own sentence ends in Models, so it offers the way there (microcopy 14.1).
  const { runCommand } = place.context;
  if (end !== undefined && providerSentence(end) !== undefined && runCommand !== undefined) {
    actions.push({
      label: words.openModels,
      onClick: () => void runCommand(openModelsCommand),
      look: "link",
    });
  }
  return (
    <ChatMessage from="reply" heading={words.said}>
      {turn.steps.map((step, index) => (
        // Steps are only added at the end, so their place is their key.
        <Step key={index} step={step} place={place} />
      ))}
      {end === undefined ? null : (
        <ChatEndLine tone={end.kind === "failed" ? "danger" : "plain"} actions={actions}>
          {endLine(end)}
        </ChatEndLine>
      )}
    </ChatMessage>
  );
}

function endActions(
  end: Turn["end"],
  onContinue: () => void,
  unavailable: ButtonUnavailable | undefined,
): ChatAction[] {
  if (end?.kind === "model-call-limit") {
    return [{ label: words.continue, onClick: onContinue, unavailable }];
  }
  if ((end?.kind === "engine-stopped" || end?.kind === "failed") && !end.toolsRan) {
    return [{ label: words.tryAgain, onClick: onContinue, unavailable }];
  }
  return [];
}

function Step({ step, place }: { readonly step: ReplyStep; readonly place: CardPlace }) {
  if (step.kind === "text") return <ChatText>{step.text}</ChatText>;
  if (step.kind === "proposal") {
    const { callId, path, content, why, afterReading } = step;
    const proposal = { chatId: place.chatId, callId, path, content };
    return (
      <ProposalCard
        proposal={proposal}
        why={why}
        afterReading={afterReading}
        context={place.context}
      />
    );
  }
  const line =
    step.shown === undefined
      ? words.tool[step.state](toolInWords(step.name))
      : words.showed(step.shown.kind, step.shown.id);
  const toolLine = <ChatToolLine state={step.state}>{line}</ChatToolLine>;
  if (step.name !== "read_docs") return toolLine;
  // `read_docs` adds its log line and, when it asked about a site, the site card under it.
  return (
    <>
      {toolLine}
      <DocsCall chatId={place.chatId} callId={step.callId} context={place.context} />
    </>
  );
}
