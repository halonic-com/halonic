import { type Tab, Tabs } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { AgentsList } from "../agents-list.tsx";
import { inboxWords } from "../inbox/inbox-words.ts";
import { PhoneInbox } from "../inbox/phone-inbox.tsx";
import { OlderComputerPanel } from "../older-computer-note.tsx";
import type { PhoneRemote, RemoteView } from "../remote-view.ts";
import type { PhoneAppRouter } from "./phone-app-router.ts";

/** The views of one paired computer, in the tab bar's order (wording p02a–c). */
export type ComputerTab = "inbox" | "agents";

/** One view of the tab bar, with what it shows while it's picked. */
export interface ComputerTabView {
  readonly id: ComputerTab;
  readonly label: string;
  readonly body: ReactNode;
}

/**
 * The tab bar over one computer's body, Inbox first (Sofia's flow A opens the Inbox). Each view is
 * one entry of `views`, so a view added later, such as Messenger, is one more entry.
 */
export function ComputerTabs({
  computer,
  views,
  selected,
  onSelect,
}: {
  /** The computer's name, which names the tab bar for a screen reader. */
  readonly computer: string;
  readonly views: readonly ComputerTabView[];
  readonly selected: ComputerTab;
  readonly onSelect: (tab: ComputerTab) => void;
}) {
  const tabs: Tab<ComputerTab>[] = views.map(({ id, label }) => ({ id, label }));
  return (
    <Tabs label={computer} tabs={tabs} selected={selected} onSelect={onSelect}>
      <div className="flex flex-col gap-4 pt-4">
        {views.find((view) => view.id === selected)?.body}
      </div>
    </Tabs>
  );
}

/** The Agents tab's label (wording p02a–c). */
const agentsTab = "Agents";

/**
 * The tab bar of one computer whose agents show: the Inbox, or "Update Halonic on…" in its place
 * while the computer speaks only version 3 (p05c), and the Agents list.
 */
export function ComputerViews({
  router,
  computer,
  remote,
  view,
  tab,
  onTab,
  onOpenSettings,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: string;
  readonly remote: PhoneRemote;
  readonly view: RemoteView;
  readonly tab: ComputerTab;
  readonly onTab: (tab: ComputerTab) => void;
  readonly onOpenSettings: () => void;
}) {
  const { messaging } = remote;
  let inbox: ReactNode = null;
  if (view.olderComputer) inbox = <OlderComputerPanel computer={computer} />;
  else if (messaging !== undefined) {
    inbox = (
      <PhoneInbox
        view={view}
        messaging={messaging}
        computer={computer}
        onOpenSettings={onOpenSettings}
      />
    );
  }
  const agents = (
    <AgentsList
      view={view}
      onOpen={(sessionId) => router.openRun(sessionId)}
      onAnswer={(sessionId, approvalId, decision) => remote.answer(sessionId, approvalId, decision)}
    />
  );
  return (
    <ComputerTabs
      computer={computer}
      views={[
        { id: "inbox", label: inboxWords.tab, body: inbox },
        { id: "agents", label: agentsTab, body: agents },
      ]}
      selected={tab}
      onSelect={onTab}
    />
  );
}
