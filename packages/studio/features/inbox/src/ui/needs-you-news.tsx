import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect } from "react";
import { InboxService } from "../api.ts";
import { watchNeedsYou } from "../needs-you-news.ts";
import { itemTitle } from "./inbox-row.tsx";

/** What {@link NeedsYouNews} gets from the shell's dialog hosts. */
export interface NeedsYouNewsProps {
  readonly context: WorkspaceContext;
}

/**
 * Draws nothing. While the window is open it says "Waiting for you: …" when Needs you goes up and
 * the Inbox isn't showing, through the window's announcer (`watchNeedsYou`).
 */
export function NeedsYouNews({ context }: NeedsYouNewsProps) {
  const inbox = context.services.get(InboxService);
  const { announcer, shown } = context;
  useEffect(
    () =>
      watchNeedsYou(inbox, {
        shown,
        title: itemTitle,
        say: (key, text) => announcer.announceState(key, text),
      }),
    [inbox, announcer, shown],
  );
  return null;
}
