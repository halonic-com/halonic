import { PhoneTabBar, PlaceIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { AgentsList } from "../agents-list.tsx";
import { inboxWords } from "../inbox/inbox-words.ts";
import { PhoneInbox } from "../inbox/phone-inbox.tsx";
import type { PhoneInboxItems } from "../inbox/use-phone-inbox.ts";
import { OlderComputerPanel } from "../older-computer-note.tsx";
import { PhoneMessenger } from "../phone-messenger.tsx";
import { phoneMessengerWords } from "../phone-messenger-words.ts";
import type { PhoneRemote, RemoteView } from "../remote-view.ts";
import type { PhoneAppRouter } from "./phone-app-router.ts";

/** The views of one paired computer, in the tab bar's order (wording p02a–c). */
export type ComputerTab = "inbox" | "messenger" | "agents";

/** The Agents tab's label (wording p02a–c). */
const agentsTab = "Agents";

/**
 * The Messenger tab's icon: the kit has no Messenger place icon yet, so this draws the speech
 * bubble of the kit's Settings "assistant" icon on the place icons' 24 grid and line, filled while
 * the tab is picked. Hidden from screen readers: the tab's label says the same.
 */
function MessengerTabIcon({ filled }: { readonly filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 5h14v10h-7l-4 4v-4H5z" fill={filled ? "currentColor" : "none"} />
    </svg>
  );
}

/**
 * The tab bar at the foot of one computer's screen (p02a), Inbox first (Sofia's flow A opens the
 * Inbox), with the count of the cards waiting there. Each tab controls `controls`, the element that
 * shows the picked view; a view added later is one more tab.
 */
export function ComputerTabs({
  computer,
  inbox,
  selected,
  controls,
  onSelect,
}: {
  /** The computer's name, which names the tab bar for a screen reader. */
  readonly computer: string;
  readonly inbox: PhoneInboxItems;
  readonly selected: ComputerTab;
  readonly controls: string;
  readonly onSelect: (tab: ComputerTab) => void;
}) {
  const waiting = inbox?.length ?? 0;
  return (
    <PhoneTabBar
      label={computer}
      tabs={[
        {
          id: "inbox",
          label: inboxWords.tab,
          icon: (picked) => <PlaceIcon name="inbox" filled={picked} />,
          count: { value: waiting, name: inboxWords.waiting(waiting) },
        },
        {
          id: "messenger",
          label: phoneMessengerWords.title,
          icon: (picked) => <MessengerTabIcon filled={picked} />,
        },
        {
          id: "agents",
          label: agentsTab,
          icon: (picked) => <PlaceIcon name="agents" filled={picked} />,
        },
      ]}
      selected={selected}
      controls={controls}
      onSelect={onSelect}
    />
  );
}

/**
 * The picked view of one computer whose agents show: the Inbox or the Messenger, or "Update
 * Halonic on…" in the place of each while the computer speaks only version 3 (p05c), or the Agents
 * list.
 */
export function ComputerViews({
  router,
  computer,
  remote,
  view,
  inbox,
  tab,
  onOpenSettings,
  onOpenLink,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: string;
  readonly remote: PhoneRemote;
  readonly view: RemoteView;
  readonly inbox: PhoneInboxItems;
  readonly tab: ComputerTab;
  readonly onOpenSettings: () => void;
  /** Opens a link `isAllowedWebLink` passed in the system browser. */
  readonly onOpenLink: (link: string) => void;
}) {
  const { messaging } = remote;
  if (tab === "agents") {
    return (
      <AgentsList
        view={view}
        onOpen={(sessionId) => router.openRun(sessionId)}
        onAnswer={(sessionId, approvalId, decision) =>
          remote.answer(sessionId, approvalId, decision)
        }
      />
    );
  }
  if (tab === "messenger") {
    if (messaging === undefined) {
      return view.olderComputer ? <OlderComputerPanel computer={computer} /> : null;
    }
    return (
      <PhoneMessenger
        messaging={messaging}
        computer={computer}
        olderComputer={view.olderComputer}
        onOpenLink={onOpenLink}
      />
    );
  }
  let shown: ReactNode = null;
  if (view.olderComputer) shown = <OlderComputerPanel computer={computer} />;
  else if (messaging !== undefined) {
    shown = (
      <PhoneInbox
        items={inbox}
        view={view}
        messaging={messaging}
        computer={computer}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  return shown;
}
