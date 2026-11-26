import type { ServiceRegistry } from "@halonicjs/app";
import { ChatOpensService } from "@halonicjs/studio-feature-messenger/api";
import { RunNoticeClicksService } from "@halonicjs/studio-feature-runs/api";
import { shellChatOpens, shellRunNoticeClicks, tauriChannelIpc } from "@halonicjs/studio-services";

/**
 * What the desktop shell hands a window's page to open: a click on a run notification opens the
 * run (`runs.run-notification-open`), and a chat quick ask's box hands over opens in Messenger
 * (`messenger.open-from-quick-ask`). In a browser there is no shell, so nothing is provided.
 */
export function provideShellHandOvers(services: ServiceRegistry, window: object): void {
  const channelIpc = tauriChannelIpc(window);
  if (channelIpc === undefined) return;
  services.provide(
    RunNoticeClicksService,
    shellRunNoticeClicks(channelIpc, (error) => console.error("Opening a run notification", error)),
  );
  services.provide(
    ChatOpensService,
    shellChatOpens(channelIpc, (error) => console.error("Opening a chat from quick ask", error)),
  );
}
