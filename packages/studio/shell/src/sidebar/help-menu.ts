import type { MenuEntry } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import type { HelpContribution, HelpItem } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * The Help menu's entries (`shell.help-menu`): each group's items in the groups' order, under the
 * group's title when it has one, with a divider between groups. A group with no items now is left
 * out, so an empty list means the sidebar shows no Help row. A group whose `items` throws is
 * reported and left out too, so one feature's mistake doesn't take the window down.
 */
export function helpMenuEntries(
  groups: readonly Registered<HelpContribution>[],
  contextFor: (featureId: string) => WorkspaceContext,
): readonly MenuEntry[] {
  const entries: MenuEntry[] = [];
  for (const group of groups) {
    const items = itemsOf(group, contextFor(group.featureId));
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

/**
 * The Help menu's entries as `helpMenuEntries` builds them, read again whenever a group says its
 * items may have changed (`subscribe`).
 */
export function useHelpMenu(
  help: { list(): readonly Registered<HelpContribution>[] },
  contextFor: (featureId: string) => WorkspaceContext,
): readonly MenuEntry[] {
  const [, setChanges] = useState(0);
  useEffect(() => {
    const changed = () => setChanges((count) => count + 1);
    const stops = help
      .list()
      .flatMap((group) =>
        group.subscribe === undefined
          ? []
          : [group.subscribe(contextFor(group.featureId), changed)],
      );
    // A change between the first read and these subscriptions would go unseen, so read once more.
    changed();
    return () => {
      for (const stop of stops) stop();
    };
  }, [help, contextFor]);
  return helpMenuEntries(help.list(), contextFor);
}

function itemsOf(
  group: Registered<HelpContribution>,
  context: WorkspaceContext,
): readonly HelpItem[] {
  try {
    return group.items(context);
  } catch (error) {
    console.error(`The Help group "${group.id}" couldn't list its items.`, error);
    return [];
  }
}
