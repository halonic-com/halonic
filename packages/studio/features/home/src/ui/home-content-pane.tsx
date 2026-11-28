import { AiChatsService } from "@halonicjs/studio-feature-assistant/api";
import type { HomeContentPaneProps } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";

/**
 * Home's content pane (`home.content-pane`): the chat the list column opened, or Home's sections
 * while none is open, and always without the Assistant. The pane holds the open chat in Home and
 * gives it back when it shows something else or goes. When the chat leaves Home (deleted, or shown
 * in the panel or a tab), the pane shows Home's sections again.
 */
export function HomeContentPane({ context, open, setOpen, sections }: HomeContentPaneProps) {
  const chats = context.services.find(AiChatsService);
  // The context is a new object on each window draw; holding keys on the chat only.
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => {
    if (chats === undefined || open === undefined) return;
    return chats.open(open, latest.current);
  }, [chats, open]);
  if (chats === undefined || open === undefined) return sections;
  return chats.render(open, context, () => setOpen(undefined));
}
