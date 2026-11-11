import { defineFeature } from "@halonicjs/studio-shell";
import { InboxRunsService, InboxService } from "./api.ts";
import { Inbox } from "./inbox.ts";

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
  provides: [InboxService],
  register(studio) {
    studio.services.provide(InboxService, (services) => new Inbox(services.get(InboxRunsService)));
    studio.places.add({
      id: "inbox",
      view: "InboxPage",
      load: () => import("./ui/inbox-page.tsx"),
      signal: (context) => context.services.get(InboxService).signal(),
      subscribeSignal: (context, listener) =>
        context.services.get(InboxService).subscribe(listener),
    });
  },
});
