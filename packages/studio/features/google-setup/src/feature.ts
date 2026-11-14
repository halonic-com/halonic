import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import { defineFeature } from "@halonicjs/studio-shell";
import { GoogleSetupAccountsService, GoogleSetupSourceService } from "./api.ts";
import { googleSetupSource } from "./google-setup-source.ts";

/**
 * The Google setup feature. When a workspace opens, it adds the Google setup source to that
 * workspace's Inbox, built from the accounts the app provides, and shows a header badge for each
 * account that needs a sign-in again or a new secret.
 */
export const googleSetupFeature = defineFeature({
  id: "google-setup",
  title: "Google setup",
  needs: [GoogleSetupAccountsService, InboxService],
  provides: [GoogleSetupSourceService],
  register(studio) {
    studio.services.provide(GoogleSetupSourceService, (services) => {
      const source = googleSetupSource(services.get(GoogleSetupAccountsService));
      services.get(InboxService).addSetupSource(source);
      return source;
    });
    studio.dialogs.add({
      id: "google-setup.connector-badges",
      order: 20,
      view: "ConnectorBadges",
      load: () => import("./ui/connector-badges.tsx"),
    });
  },
});
