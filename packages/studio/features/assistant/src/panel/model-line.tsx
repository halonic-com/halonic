import { showUnfinishedSettings } from "@halonicjs/studio-feature-settings/api";
import { type ChatAction, ChatBoxLine } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useId, useState } from "react";
import type { Chat, ModelOption } from "../api.ts";
import { buildChatWords as words } from "../chat/build-chat-words.ts";
import { type ChatChoices, type ReadChoices, sameModel } from "./chat-choices.tsx";

/** Why a Build chat can't send with its model (states H18 to H20). */
export type ModelLine =
  | { readonly kind: "no-model" }
  | { readonly kind: "needs-key"; readonly model: string; readonly provider: string }
  | { readonly kind: "local-only"; readonly model: string; readonly workspace: string };

/**
 * The line a Build chat's model puts under the box (flow-assistant 5.9): none for an agent chat,
 * before the models are read, or for a model that can be used. Without any model at all it is
 * H18. A chat on the Assistant model when none is set answers on the alias `default` (flow 5.2).
 */
export function modelLineOf(chat: Chat, choices: ChatChoices): ModelLine | undefined {
  if (chat.kind !== "build" || !choices.read) return undefined;
  if (choices.models.length === 0) return { kind: "no-model" };
  const option = optionOf(chat, choices.models);
  const problem = option?.problem ?? null;
  if (option === undefined || problem === null) return undefined;
  return problem.kind === "needs-key"
    ? { kind: "needs-key", model: option.label, provider: problem.provider }
    : { kind: "local-only", model: option.label, workspace: problem.workspace };
}

function optionOf(chat: Chat, models: readonly ModelOption[]): ModelOption | undefined {
  const own = models.find((option) => sameModel(option.model, chat.model));
  if (own !== undefined || chat.model.kind === "alias") return own;
  return models.find((option) => sameModel(option.model, { kind: "alias", name: "default" }));
}

/** What the chat's model does to the box: its line, what Send does instead, or Send waiting. */
export interface ModelBox {
  readonly line: ReactNode;
  /** Send doesn't send: it reads the models again and points at the line's link (flow 7). */
  readonly onSendHeld: (() => void) | undefined;
  /** The line's id, for Send to wait on when the line has no link to go to (H20). */
  readonly waitsOn: string | undefined;
}

/** Opens the workspace page's Models, where keys are kept (models flow 3.1). */
export const openModelsCommand = "workspace.open-models";

/**
 * The model's line under a Build chat's box, in `warning` with the triangle, because the chat can't
 * send (flow-assistant 5.9, Noah's N1). No model at all offers **Settings ›** and a missing key
 * **Set the key ›**; pressing Send then keeps the message and puts focus on that link, so Send is
 * never dead (flow 7). A cloud model in a local-only workspace has no link: Send waits with the
 * line as its reason, and the Model chip is where to pick another.
 */
export function useModelBox(
  chat: Chat | undefined,
  choices: ReadChoices,
  context: WorkspaceContext,
  box: RefObject<HTMLTextAreaElement | null>,
): ModelBox {
  const id = useId();
  // Focus moves once the models read again have rendered, so it lands on the line as it is now.
  const [focusAfterRead, setFocusAfterRead] = useState(0);
  useEffect(() => {
    if (focusAfterRead === 0) return;
    const link = document.getElementById(id)?.querySelector("button");
    if (link) link.focus();
    else box.current?.focus();
  }, [focusAfterRead, id, box]);
  const line = chat === undefined ? undefined : modelLineOf(chat, choices);
  if (chat === undefined || line === undefined) {
    return { line: undefined, onSendHeld: undefined, waitsOn: undefined };
  }
  const link = linkOf(line, context);
  const sendHeld = async () => {
    await choices.again();
    setFocusAfterRead((count) => count + 1);
  };
  return {
    line: (
      <div id={id}>
        <ChatBoxLine tone="warning" actions={link === undefined ? [] : [link]}>
          {sentenceOf(line)}
        </ChatBoxLine>
      </div>
    ),
    onSendHeld: link === undefined ? undefined : () => void sendHeld(),
    waitsOn: link === undefined ? id : undefined,
  };
}

function sentenceOf(line: ModelLine): ReactNode {
  switch (line.kind) {
    case "no-model":
      return words.noModel;
    case "needs-key":
      return (
        <>
          {words.noUsableModel} <code>{line.model}</code> {words.needsKey(line.provider)}
        </>
      );
    case "local-only":
      return words.localOnly(line.workspace, line.model);
  }
}

/**
 * **Settings ›** opens Settings › Assistant, so it shows only while Settings shows that section
 * (HAL-17857); without it the line has no link and Send waits on it. **Set the key ›** opens
 * Models, where keys are kept, until the models feature offers the provider's key block (models
 * flow 3.3).
 */
function linkOf(line: ModelLine, context: WorkspaceContext): ChatAction | undefined {
  const { openSettings, runCommand } = context;
  if (line.kind === "no-model" && openSettings !== undefined && showUnfinishedSettings) {
    return { label: words.openSettings, onClick: () => openSettings("assistant"), look: "link" };
  }
  if (line.kind === "needs-key" && runCommand !== undefined) {
    return { label: words.setTheKey, onClick: () => runCommand(openModelsCommand), look: "link" };
  }
  return undefined;
}
