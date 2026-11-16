import { sandboxStartCheckKey } from "@halonicjs/app";
import { defineFeature } from "@halonicjs/studio-shell";
import {
  InboxRequestsService,
  InboxRunsService,
  InboxService,
  SandboxRefusalsService,
} from "./api.ts";
import { Inbox } from "./inbox.ts";
import { sandboxSetupSource } from "./sandbox/sandbox-setup-source.ts";

/**
 * The Inbox feature. It builds one {@link Inbox} per open workspace from the
 * runs the app provides (`InboxRunsService`), and offers it to the other
 * features as `InboxService`. It adds the Inbox place, whose count in the
 * sidebar reads that same Inbox and changes with it.
 */
export const inboxFeature = defineFeature({
  id: "inbox",
  title: "Inbox",
  needs: [InboxRunsService],
  wants: [InboxRequestsService, SandboxRefusalsService, sandboxStartCheckKey],
  provides: [InboxService],
  register(studio) {
    studio.services.provide(InboxService, (services) => {
      const inbox = new Inbox(services.get(InboxRunsService));
      // The sandbox row needs both the refused runs and the check; with either missing there is none.
      const refusals = services.find(SandboxRefusalsService);
      const check = services.find(sandboxStartCheckKey);
      if (refusals !== undefined && check !== undefined) {
        inbox.addSetupSource(sandboxSetupSource(refusals, check));
      }
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
