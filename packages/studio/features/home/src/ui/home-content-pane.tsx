import { AiChatsService } from "@halonicjs/studio-feature-assistant/api";
import type { HomeContentPaneProps } from "@halonicjs/studio-shell";

/**
 * Home's content pane (`home.content-pane`): the chat the list column opened, or Home's sections
 * while none is open, and always without the Assistant.
 */
export function HomeContentPane({ context, open, sections }: HomeContentPaneProps) {
  const chats = context.services.find(AiChatsService);
  if (chats === undefined || open === undefined) return sections;
  return chats.render(open, context);
}
