import { PhoneTabBar, PlaceIcon } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { AgentsList } from "../agents-list.tsx";
import { inboxWords } from "../inbox/inbox-words.ts";
import { PhoneInbox } from "../inbox/phone-inbox.tsx";
import type { PhoneInboxItems } from "../inbox/use-phone-inbox.ts";
import { OlderComputerPanel } from "../older-computer-note.tsx";
import type { PhoneRemote, RemoteView } from "../remote-view.ts";
import type { PhoneAppRouter } from "./phone-app-router.ts";

/** The views of one paired computer, in the tab bar's order (wording p02a–c). */
export type ComputerTab = "inbox" | "agents";

/** The Agents tab's label (wording p02a–c). */
const agentsTab = "Agents";

/**
 * The tab bar at the foot of one computer's screen (p02a), Inbox first (Sofia's flow A opens the
 * Inbox), with the count of the cards waiting there. Each tab controls `controls`, the element that
 * shows the picked view; a view added later, such as Messenger, is one more tab.
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
 * The picked view of one computer whose agents show: the Inbox, or "Update Halonic on…" in its
 * place while the computer speaks only version 3 (p05c), or the Agents list.
 */
export function ComputerViews({
  router,
  computer,
  remote,
  view,
  inbox,
  tab,
  onOpenSettings,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: string;
  readonly remote: PhoneRemote;
  readonly view: RemoteView;
  readonly inbox: PhoneInboxItems;
  readonly tab: ComputerTab;
  readonly onOpenSettings: () => void;
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
