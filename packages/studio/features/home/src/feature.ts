import { AiChatsService } from "@halonicjs/studio-feature-assistant/api";
import { defineFeature } from "@halonicjs/studio-shell";

/**
 * The Home feature: Home's view in the rail's layout (HAL-20673 rail flows, section 2), with the
 * AI chats in its list column and the open chat or Home's sections in its content pane. The shell
 * adds Home's rail entry, keeps which chat is open and draws the sections; the Assistant gives the
 * chats, when the app gives it a host.
 */
export const homeFeature = defineFeature({
  id: "home",
  title: "Home",
  wants: [AiChatsService],
  register(studio) {
    studio.home.setView({
      listColumn: { view: "HomeListColumn", load: () => import("./ui/home-list-column.tsx") },
      contentPane: { view: "HomeContentPane", load: () => import("./ui/home-content-pane.tsx") },
    });
  },
});
