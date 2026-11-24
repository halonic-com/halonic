import { usePresentation } from "@halonicjs/studio-kit";
import { RenameSheet } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { chatMenuWords as words } from "../chat/chat-menu-words.ts";
import type { ChatHeaderProps } from "./chat-header.tsx";
import { focusPanelHeading } from "./phone-header.tsx";
import { RecentChatsSheet } from "./recent-chats-sheet.tsx";

/** The phone's parts of the panel: the sheet over the chat, and the title that takes the focus. */
export interface PhoneChat {
  /** Whether the Studio shows the phone layout. */
  readonly on: boolean;
  readonly sheet: "recent-chats" | "rename" | undefined;
  readonly open: (sheet: "recent-chats" | "rename") => void;
  readonly close: () => void;
  /** Inside the top bar, for finding the panel's heading. */
  readonly anchor: RefObject<HTMLDivElement | null>;
  /** Focus to "Assistant" once the panel has drawn what changed, with the keyboard closed. */
  readonly focusTitle: () => void;
}

/** The Assistant panel's phone state (flow-assistant 11.3); `on` is false on a computer. */
export function usePhoneChat(): PhoneChat {
  const on = usePresentation() === "phone";
  const [sheet, setSheet] = useState<PhoneChat["sheet"]>();
  // Counts the requests, so focus moves after the render that closes a sheet or shows a chat.
  const [titleFocus, setTitleFocus] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (titleFocus > 0) focusPanelHeading(anchor);
  }, [titleFocus]);
  return {
    on,
    sheet,
    open: setSheet,
    close: () => setSheet(undefined),
    anchor,
    focusTitle: () => setTitleFocus((count) => count + 1),
  };
}

/**
 * The panel with the phone's sheets over it: Recent chats, a panel sheet over the chat, which
 * stays drawn under it and inert, and Rename, the shell's form sheet "Rename chat". On a computer
 * it's the panel alone.
 */
export function PhoneSheets(
  props: ChatHeaderProps & { readonly phone: PhoneChat; readonly panel: ReactNode },
) {
  const { phone, chats, view } = props;
  if (!phone.on) return props.panel;
  const kept = view?.chat.draft === false ? view.chat : undefined;
  return (
    <>
      <div className="contents" inert={phone.sheet === "recent-chats"}>
        {props.panel}
      </div>
      {phone.sheet === "recent-chats" ? (
        <RecentChatsSheet
          host={props.host}
          chats={chats}
          currentId={view?.chat.id}
          onPicked={() => {
            phone.close();
            phone.focusTitle();
          }}
          onClose={phone.close}
        />
      ) : null}
      {phone.sheet === "rename" && kept !== undefined ? (
        <RenameSheet
          kindName={words.phone.kindName}
          name={kept.title}
          // A rename the host refuses keeps the old title, as the rename field does on a computer.
          onRename={(name) => void chats.rename(name).catch(() => {})}
          onClose={phone.close}
        />
      ) : null}
    </>
  );
}
