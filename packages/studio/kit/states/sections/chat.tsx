import { Avatar } from "../../src/avatar/avatar.tsx";
import { Button } from "../../src/button/button.tsx";
import { ChatComposer } from "../../src/chat/chat-composer.tsx";
import { ChatMessage } from "../../src/chat/chat-message.tsx";
import { ChatText } from "../../src/chat/chat-text.tsx";
import { ContentHeader } from "../../src/content-header/content-header.tsx";
import { MoreIcon } from "../../src/icons/more-icon.tsx";
import { SearchIcon } from "../../src/icons/search-icon.tsx";
import type { PartSection } from "../state-table.tsx";

const ignore = () => undefined;

/** The chat header with a second line and two actions, as over an open chat. */
function Header() {
  return (
    <div className="w-full">
      <ContentHeader
        picture={<Avatar name="Sorter" size="header" />}
        title="Sorter"
        line="Acme · working"
        actions={
          <>
            <Button variant="ghost" round icon={<SearchIcon />} label="Find" onClick={ignore} />
            <Button variant="ghost" round icon={<MoreIcon />} label="More" onClick={ignore} />
          </>
        }
      />
    </div>
  );
}

/** Your bubble, then a reply, as the transcript shows them. */
function Messages() {
  return (
    <div className="flex w-full flex-col gap-3">
      <ChatMessage from="you">Can we move the sort to Friday?</ChatMessage>
      <ChatMessage from="reply" heading="Sorter said">
        <ChatText>Done. The sort runs on Friday at 09:00.</ChatText>
      </ChatMessage>
    </div>
  );
}

/** The message box, empty or holding a message. */
function Composer({ value }: { readonly value: string }) {
  return (
    <div className="w-full">
      <ChatComposer
        label="Message Sorter"
        placeholder="Message Sorter…"
        value={value}
        onChange={ignore}
        onSend={ignore}
        onStop={ignore}
        answering={false}
      />
    </div>
  );
}

export const chatSection: PartSection = {
  id: "chat",
  number: "28",
  name: "Chat header, messages and message box",
  order: "kit 28 · top to bottom: the header, your bubble and a reply, the message box",
  notApplicable: "hover and focus (shown by Button and TextArea), disabled (the box never is)",
  rows: [
    { name: "Header", copies: () => <Header /> },
    { name: "Messages", copies: () => <Messages /> },
    { name: "Message box, empty", copies: () => <Composer value="" /> },
    { name: "Message box, with text", copies: () => <Composer value="Sort this mail" /> },
  ],
};
