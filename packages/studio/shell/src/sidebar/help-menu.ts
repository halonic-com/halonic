import type { MenuEntry } from "@halonicjs/studio-kit";
import type { HelpContribution } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * The Help menu's entries (`shell.help-menu`): each group's items in the groups' order, under the
 * group's title when it has one, with a divider between groups. A group with no items now is left
 * out, so an empty list means the sidebar shows no Help row.
 */
export function helpMenuEntries(
  groups: readonly Registered<HelpContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): readonly MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const group of groups) {
    const items = group.items(contextFor(group.featureId));
    if (items.length === 0) {
      continue;
    }
    if (entries.length > 0) {
      entries.push("divider");
    }
    if (group.title !== undefined) {
      entries.push({ heading: group.title });
    }
    for (const item of items) {
      // Item ids are unique per group, so the menu's ids carry the group's too.
      entries.push({ id: `${group.id}:${item.id}`, label: item.label, onSelect: () => item.run() });
    }
  }
  return entries;
}
