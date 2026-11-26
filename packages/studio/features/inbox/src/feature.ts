import { sandboxStartCheckKey } from "@halonicjs/app";
import { AccountMenuHostService } from "@halonicjs/studio-feature-account-menu/api";
import {
  ActionCatalogService,
  RequesterPolicyService,
} from "@halonicjs/studio-feature-action-steppers/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { AgentMessagingService, actionStepsKey } from "@halonicjs/studio-services";
import { defineFeature } from "@halonicjs/studio-shell";
import {
  HeldAgentsService,
  InboxNoticesService,
  InboxRequestsService,
  InboxRunsService,
  InboxService,
  ProposalDecisionsService,
  SandboxPassesService,
  SandboxRefusalsService,
} from "./api.ts";
import { Inbox } from "./inbox.ts";
import type { InboxNotices } from "./notices/inbox-notices.ts";
import { joinInboxNotices } from "./notices/merge-notices.ts";
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
    // What runs its steps with the user's sign-in, in the desktop app (inbox.agent-action-run).
    actionStepsKey,
    // The customer's account page, for **See usage** on a run at a plan limit (inbox.plan-limit-card).
    AccountMenuHostService,
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
      return inbox;
    });
    studio.places.add({
      id: "inbox",
      view: "InboxPage",
      load: () => import("./ui/inbox-page.tsx"),
      signal: (context) => context.services.get(InboxService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(InboxService).subscribe(listener),
    });
    // The Inbox's own window, Halonic Inbox (shell.focused-apps): the same page, in the frame's panel.
    studio.focusedApps.add({
      id: "inbox",
      title: "Inbox",
      view: "InboxPage",
      load: () => import("./ui/inbox-page.tsx"),
      panel: true,
    });
    studio.dialogs.add({
      id: "inbox.needs-you-news",
      order: 10,
      view: "NeedsYouNews",
      load: () => import("./ui/needs-you-news.tsx"),
    });
    studio.home.addCard({
      id: "needs-you",
      view: "NeedsYouCard",
      load: () => import("./ui/needs-you-card.tsx"),
      signal: (context) => context.services.get(InboxService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(InboxService).subscribe(listener),
    });
  },
});
