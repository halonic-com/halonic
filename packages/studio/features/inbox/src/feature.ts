import { sandboxStartCheckKey } from "@halonicjs/app";
import { AccountMenuHostService } from "@halonicjs/studio-feature-account-menu/api";
import {
  ActionCatalogService,
  RequesterPolicyService,
} from "@halonicjs/studio-feature-action-steppers/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import {
  AgentConnectionsService,
  AgentMessagingService,
  actionStepsKey,
} from "@halonicjs/studio-services";
import { defineFeature } from "@halonicjs/studio-shell";
import {
  AgentNotifierService,
  HeldAgentsService,
  InboxNoticesService,
  InboxRequestsService,
  InboxRunsService,
  InboxService,
  ProposalDecisionsService,
  SandboxPassesService,
  SandboxRefusalsService,
  ServedHomeHintService,
} from "./api.ts";
import { Inbox } from "./inbox.ts";
import { inboxNewSignal } from "./inbox-count.ts";
import type { InboxNotices } from "./notices/inbox-notices.ts";
import { joinInboxNotices } from "./notices/merge-notices.ts";
import { StoredReadMarks } from "./read-marks.ts";
import { onHoldSetup } from "./sandbox/on-hold-setup-source.ts";
import { sandboxSetup } from "./sandbox/sandbox-setup-source.ts";

/**
 * The Inbox feature. It builds one {@link Inbox} per open workspace from the
 * runs the app provides (`InboxRunsService`), and offers it to the other
 * features as `InboxService`. It adds the Inbox place, whose count in the
 * sidebar reads that same Inbox and changes with it, and the same page as the
 * focused app Halonic Inbox.
 */
export const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  needs: [InboxRunsService],
  // The page reads the app's notices (HAL-1845); listing them here lets it look them up (HAL-11189).
  wants: [
    InboxNoticesService,
    InboxRequestsService,
    SandboxRefusalsService,
    sandboxStartCheckKey,
    SandboxPassesService,
    // The agents on hold, one row each (checklist 3.8).
    HeldAgentsService,
    // A run proposal's Accept and Reject, from the agent host (HAL-10916).
    ProposalDecisionsService,
    // The page reads each run's workflow and starter from the Runs list for the card and row.
    RunsListService,
    // The agents' cards and questions, from every AgentMessaging source (inbox.agent-inbox-items).
    AgentMessagingService,
    // What an agent's action request is checked against when it opens (inbox.agent-action-items).
    ActionCatalogService,
    RequesterPolicyService,
    // The connected Paperclips, the only hosts a Paperclip request runs on (action-steppers.paperclip-host).
    AgentConnectionsService,
    // What runs its steps with the user's sign-in, in the desktop app (inbox.agent-action-run).
    actionStepsKey,
    // The customer's account page, for **See usage** on a run at a plan limit (inbox.plan-limit-card).
    AccountMenuHostService,
    // The served Studio's next step under an empty Needs you (inbox.home-next-step).
    ServedHomeHintService,
    // The folder's desktop notifications, for the agents' items (inbox.agent-notifications-start).
    AgentNotifierService,
  ],
  provides: [InboxService],
  register(studio) {
    studio.services.provide(InboxService, (services) => {
      const inbox = new Inbox(services.get(InboxRunsService));
      const notices: InboxNotices[] = [];
      // The sandbox row needs both the refused runs and the check; with either missing there is none.
      const refusals = services.find(SandboxRefusalsService);
      const check = services.find(sandboxStartCheckKey);
      if (refusals !== undefined && check !== undefined) {
        const sandbox = sandboxSetup(
          refusals,
          check,
          () => new Date(),
          services.find(SandboxPassesService),
        );
        inbox.addSetupSource(sandbox.source);
        notices.push(sandbox.notices);
      }
      const held = services.find(HeldAgentsService);
      if (held !== undefined) {
        const onHold = onHoldSetup(held);
        inbox.addSetupSource(onHold.source);
        notices.push(onHold.notices);
      }
      inbox.extraNotices = joinInboxNotices(notices);
      // Another window's marks come in through the page's `storage` event (inbox.sidebar-new).
      const events = globalThis instanceof EventTarget ? globalThis : null;
      inbox.readMarks = new StoredReadMarks(globalThis.localStorage ?? null, undefined, events);
      return inbox;
    });
    studio.places.add({
      id: "inbox",
      view: "InboxPage",
      load: () => import("./ui/inbox-page.tsx"),
      // The new items, not all that wait: Home's Needs you keeps that count (inbox.sidebar-new).
      signal: (context) => {
        const inbox = context.services.get(InboxService);
        return inboxNewSignal(inbox.state.items, inbox.readMarks);
      },
      subscribeSignal: (context, listener) => {
        const inbox = context.services.get(InboxService);
        const stopItems = inbox.subscribe(listener);
        const stopMarks = inbox.readMarks.subscribe(listener);
        return () => {
          stopItems();
          stopMarks();
        };
      },
    });
    // The Inbox's own window, Halonic Inbox (shell.focused-apps): the same page, its list on the
    // frame and the item on a framed panel beside it (inbox.framed-sidebar).
    studio.focusedApps.add({
      id: "inbox",
      title: "Inbox",
      view: "InboxWindow",
      load: () => import("./ui/inbox-page.tsx"),
    });
    studio.dialogs.add({
      id: "inbox.needs-you-news",
      order: 10,
      view: "NeedsYouNews",
      load: () => import("./ui/needs-you-news.tsx"),
    });
    studio.dialogs.add({
      id: "inbox.agent-notices",
      order: 11,
      view: "AgentNoticeHost",
      load: () => import("./ui/agent-notice-host.tsx"),
    });
    studio.home.addCard({
      id: "needs-you",
      view: "NeedsYouCard",
      load: () => import("./ui/needs-you-card.tsx"),
      signal: (context) => context.services.get(InboxService).signal(),
      // The count in the Needs you violet, as the Runs group and the Messenger draw it (HAL-19141, 8).
      signalTone: "warning",
      subscribeSignal: (context, listener) =>
        context.services.get(InboxService).subscribe(listener),
    });
  },
});
