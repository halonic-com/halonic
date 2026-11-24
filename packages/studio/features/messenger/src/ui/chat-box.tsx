import type { MessagingRefusal } from "@halonicjs/ports";
import { Button, ChatBoxLine, ChatComposer } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { DraftFile } from "../draft-files.ts";
import { type ConversationRow, type Messenger, refusalOf } from "../messenger.ts";
import { messengerWords } from "../messenger-words.ts";
import { AttachFileButton, DraftFileList, pastedFiles } from "./draft-files-bar.tsx";

/** The props of {@link ChatBox}. */
export interface ChatBoxProps {
  readonly messenger: Messenger;
  readonly row: ConversationRow;
  /** Called once something was sent, so the chat reads its messages again. */
  readonly onSent: () => Promise<void>;
}

/**
 * A chat's box: "Attach a file" and "Ask for an update", the files waiting
 * in it on their own row, the text, and
 * the line saying why something wasn't sent. A screenshot pasted anywhere in
 * it waits with the files (requirements `messenger.files`,
 * `messenger.quick-actions` and `messenger.conversations`).
 */
export function ChatBox({ messenger, row, onSent }: ChatBoxProps) {
  const box = useChatBox(messenger, row, onSent);
  const name = row.conversation.title;
  const report = (what: string) => (error: unknown) => console.error(what, error);
  return (
    <div
      className="flex flex-col gap-2 px-4 pb-4"
      onPaste={(event) => {
        const pasted = pastedFiles(event.clipboardData);
        if (pasted.length === 0) return;
        event.preventDefault();
        box.addFiles(pasted);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AttachFileButton onAdd={box.addFiles} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void box.askForUpdate().catch(report("The chat couldn't ask for an update:"));
          }}
        >
          {messengerWords.askForUpdate}
        </Button>
      </div>
      <DraftFileList files={box.files} onRemove={box.removeFile} />
      <ChatComposer
        label={messengerWords.composerLabel(name)}
        placeholder={messengerWords.composerPlaceholder(name)}
        value={box.draft}
        onChange={box.type}
        onSend={() => {
          void box.send().catch(report("The message couldn't be sent:"));
        }}
        onStop={() => {}}
        answering={false}
        line={
          box.line === undefined ? undefined : <ChatBoxLine tone="warning">{box.line}</ChatBoxLine>
        }
      />
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
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const source = row.source?.label ?? "";

  return {
    draft,
    files,
    line: notice ?? keptLine(source, kept ?? refusalOf(row)),
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
      setNotice(refused);
    },
    removeFile(index: number) {
      messenger.files.remove(id, index);
      setFiles(messenger.files.of(id));
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
      } else setNotice(messengerWords.notSent[outcome.reason](source));
    },
  };
}

/** Why a message would stay in the box, or nothing while the source takes messages. */
function keptLine(source: string, refusal: MessagingRefusal | undefined): string | undefined {
  return refusal === undefined ? undefined : messengerWords.kept[refusal](source);
}
