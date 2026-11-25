import { defineFeature } from "@halonicjs/studio-shell";
import { AccountMenuHostService } from "./api.ts";

/**
 * The account menu feature (S2-25, flows B7): in a served Studio with many users and a Halonic
 * Cloud session, the customer's initials at the title bar's right end open a menu with their name,
 * their plan and usage, **Account** and **Sign out** (`account-menu.menu`). Where nothing provides
 * the host, as in the desktop app, or the computer has no menu to show, it draws nothing. After
 * **Sign out**, its dialog host draws the signed-out page over the window in every layout
 * (`account-menu.sign-out`), since a phone draws the title bar's items only at a place's top.
 */
export const accountMenuFeature = defineFeature({
  id: "account-menu",
  title: "Account menu",
  wants: [AccountMenuHostService],
  register(studio) {
    studio.titleBar.add({
      id: "account-menu.menu",
      order: 100,
      view: "AccountMenuItem",
      load: () => import("./ui/account-menu-item.tsx"),
    });
    studio.dialogs.add({
      id: "account-menu.signed-out",
      order: 100,
      view: "SignedOutDialog",
      load: () => import("./ui/signed-out-dialog.tsx"),
    });
  },
});
