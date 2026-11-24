import type { MenuItem } from "@halonicjs/studio-kit";
import type { AgentScreenProps } from "./agent-screen-props.ts";

/**
 * The page ⋮'s **Show in chat** (`assistant.chat.show-in-chat`), first in the menu. None without
 * the Assistant, and none on a phone, whose full-page chat comes later (flow-assistant 11).
 */
export function showInChatEntry(
  showInChat: AgentScreenProps["showInChat"],
  name: string,
  phone: boolean,
): MenuItem[] {
  if (showInChat === undefined || phone) return [];
  return [{ id: "show-in-chat", label: showInChat.label, onSelect: () => showInChat.show(name) }];
}
