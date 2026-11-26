import { AgentMessagingService } from "@halonicjs/studio-services";
import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { AgentNotifierService, InboxService } from "../api.ts";
import { followAgentNotices } from "../notify/agent-notices.ts";

/**
 * Shows the agents' desktop notifications while the workspace window is open
 * (`inbox.agent-notifications-start`). It draws nothing. Without the agents' messaging or the
 * app's notifier, as in a browser, it does nothing.
 */
export function AgentNoticeHost({ context }: DialogHostProps) {
  const messaging = context.services.find(AgentMessagingService);
  const notifier = context.services.find(AgentNotifierService);
  // Read through a ref, so a click opens through the window as it is then, without a new watch.
  const current = useRef(context);
  current.current = context;
  useEffect(() => {
    if (messaging === undefined || notifier === undefined) return;
    const watch = followAgentNotices(messaging, notifier, {
      window: () => ({
        inbox: current.current.services.find(InboxService),
        openPlace: current.current.openPlace,
      }),
      onError: (error) => console.error("An agent notification", error),
    });
    return () => {
      watch.stop().catch((error: unknown) => console.error("Stopping agent notifications", error));
    };
  }, [messaging, notifier]);
  return null;
}
