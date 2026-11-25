import type { MessagingRefusal } from "@halonicjs/ports";
import { Button, ChatBoxLine, type ChatBoxLineTone, ChatComposer } from "@halonicjs/studio-kit";
import { type Ref, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { isChannel } from "../channel.ts";
import { channelWords } from "../channel-words.ts";
import type { DraftFile } from "../draft-files.ts";
import { type ConversationRow, type Messenger, refusalOf } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { ChannelAddressBar, useChannelAddress } from "./channel-address.tsx";
import { AttachFileButton, DraftFileList, pastedFiles } from "./draft-files-bar.tsx";

/** The props of {@link ChatBox}. */
export interface ChatBoxProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  /** Called once something was sent, so the chat reads its messages again. */
  readonly onSent: () => Promise<void>;
}

/**
 * The line under the box: why something wasn't sent or added, or a `muted` note of what just
 * happened, such as a file removed. A note never hides why Send won't work (HAL-18316 MS7).
 */
interface BoxLine {
  readonly text: string;
  readonly tone: ChatBoxLineTone;
  /** Only read out: the To line above the box already shows it. */
  readonly unseen?: boolean;
}

/**
 * A chat's box: "Attach a file" and "Ask for an update", the files waiting
 * in it on their own row, the text, and
 * the line saying why something wasn't sent. A screenshot pasted anywhere in
 * it waits with the files (requirements `messenger.files`,
 * `messenger.quick-actions` and `messenger.conversations`). Remove takes its
 * button away, so focus moves to the next file's Remove, else the one before,
 * else Attach a file, and the line says the file was removed (HAL-18074 MS3).
 * A channel's box has the To line and the `@` picker above it (`messenger.channel-messages`); a
 * chip's Remove moves focus the same way, ending on the box, and the line says the new To line
 * (HAL-18316 MS9, MS10).
 */
export function ChatBox({ messenger, row, onSent }: ChatBoxProps) {
  const box = useChatBox(messenger, row, onSent);
  const name = row.conversation.title;
  const channel = isChannel(row);
  const address = useChannelAddress(messenger, row, box.draft, box.type, box.say);
  const waits = channel && address.line.waits !== undefined;
  const report = (what: string) => (error: unknown) => console.error(what, error);
  const container = useRef<HTMLDivElement>(null);
  const attach = useRef<HTMLButtonElement>(null);
  const remove = (index: number) => {
    flushSync(() => box.removeFile(index));
    focusAfterRemove(container.current, "[data-draft-files] button", index, attach.current);
  };
  const unname = (index: number) => {
    const agent = address.named[index];
    if (agent === undefined) return;
    flushSync(() => address.unname(agent.id));
    focusAfterRemove(container.current, "[data-chip] button", index, "textarea");
  };
  return (
    <div
      ref={container}
      className="flex flex-col gap-2 px-4 pb-4"
      onPaste={(event) => {
        const pasted = pastedFiles(event.clipboardData);
        if (pasted.length === 0) return;
        event.preventDefault();
        box.addFiles(pasted);
      }}
    >
      <BoxButtons
        onAdd={box.addFiles}
        attach={attach}
        onAskForUpdate={() => {
          void box.askForUpdate().catch(report("The chat couldn't ask for an update:"));
        }}
      />
      <DraftFileList files={box.files} onRemove={remove} />
      {channel ? <ChannelAddressBar address={address} onUnname={unname} /> : null}
      <ChatComposer
        label={channel ? channelWords.composer(name) : messengerWords.composerLabel(name)}
        placeholder={
          channel ? channelWords.composer(name) : messengerWords.composerPlaceholder(name)
        }
        value={box.draft}
        onChange={box.type}
        sendUnavailable={waits ? { reason: address.lineId } : undefined}
        onSend={() => {
          void box.send().then(address.refresh, report("The message couldn't be sent:"));
        }}
        onStop={() => {}}
        answering={false}
        line={boxLine(box.line)}
        picker={channel ? address.picker : undefined}
      />
    </div>
  );
}

/**
 * Once the Remove at `index` under `container` is gone: the next Remove, else the one before, else
 * `fallback` (an element, or a selector under `container`) takes focus.
 */
function focusAfterRemove(
  container: HTMLElement | null,
  removes: string,
  index: number,
  fallback: HTMLElement | string | null,
): void {
  const left = container?.querySelectorAll<HTMLElement>(removes);
  const last =
    typeof fallback === "string" ? container?.querySelector<HTMLElement>(fallback) : fallback;
  (left?.[index] ?? left?.[index - 1] ?? last)?.focus();
}

/** The buttons above the box: "Attach a file" and "Ask for an update". */
function BoxButtons({
  onAdd,
  attach,
  onAskForUpdate,
}: {
  readonly onAdd: (files: readonly DraftFile[]) => void;
  readonly attach: Ref<HTMLButtonElement>;
  readonly onAskForUpdate: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AttachFileButton onAdd={onAdd} buttonRef={attach} />
      <Button variant="secondary" size="sm" onClick={onAskForUpdate}>
        {messengerWords.askForUpdate}
      </Button>
    </div>
  );
}

/** The box's state, kept in the Messenger so it survives switching chats, and its actions. */
function useChatBox(messenger: Messenger, row: ConversationRow, onSent: () => Promise<void>) {
  const id = row.conversation.id;
  const [draft, setDraft] = useState(() => messenger.draft(id));
  const [files, setFiles] = useState(() => messenger.files.of(id));
  const [kept, setKept] = useState<MessagingRefusal | undefined>(undefined);
  // What the last action that sent nothing says: a quick action, a file or a send.
  const [notice, setNotice] = useState<BoxLine | undefined>(undefined);
  const source = row.source?.label ?? "";
  const warn = (text: string | undefined): BoxLine | undefined =>
    text === undefined ? undefined : { text, tone: "warning" };

  return {
    draft,
    files,
    line: lineOf(notice, warn(keptLine(source, kept ?? refusalOf(row)))),
    type(text: string) {
      setDraft(text);
      messenger.setDraft(id, text);
    },
    addFiles(added: readonly DraftFile[]) {
      let refused: string | undefined;
      for (const file of added) {
        const refusal = messenger.files.add(id, file);
        if (refusal !== undefined) refused = messengerWords.files.refused[refusal](file.name);
      }
      setFiles(messenger.files.of(id));
      setNotice(warn(refused));
    },
    say: (text: string) => setNotice({ text, tone: "muted", unseen: true }),
    removeFile(index: number) {
      const removed = messenger.files.of(id)[index];
      messenger.files.remove(id, index);
      setFiles(messenger.files.of(id));
      if (removed !== undefined) {
        setNotice({ text: messengerWords.files.removed(removed.name), tone: "muted" });
      }
    },
    async send() {
      const outcome = await messenger.sendDraft(id, row);
      if (outcome.outcome === "kept") {
        if (outcome.reason !== "blank") setKept(outcome.reason);
        return;
      }
      setKept(undefined);
      setNotice(undefined);
      // The Messenger cleared the draft only if nothing was typed during the send.
      setDraft(messenger.draft(id));
      setFiles(messenger.files.of(id));
      await onSent();
    },
    async askForUpdate() {
      const outcome = await messenger.quickActions.askForUpdate(row);
      if (outcome.outcome === "sent") {
        setNotice(undefined);
        await onSent();
      } else setNotice(warn(messengerWords.notSent[outcome.reason](source)));
    },
  };
}

/** The line in the composer's status region; an unseen one only for a screen reader. */
function boxLine(line: BoxLine | undefined) {
  if (line === undefined) return undefined;
  if (line.unseen === true) return <span className="sr-only">{line.text}</span>;
  return <ChatBoxLine tone={line.tone}>{line.text}</ChatBoxLine>;
}

/** The notice, unless it's only a note and a message would stay in the box: then why. */
function lineOf(notice: BoxLine | undefined, kept: BoxLine | undefined): BoxLine | undefined {
  if (notice?.tone === "muted" && kept !== undefined) return kept;
  return notice ?? kept;
}

/** Why a message would stay in the box, or nothing while the source takes messages. */
function keptLine(source: string, refusal: MessagingRefusal | undefined): string | undefined {
  return refusal === undefined ? undefined : messengerWords.kept[refusal](source);
}
