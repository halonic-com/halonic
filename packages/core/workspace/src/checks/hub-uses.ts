import type { LoadedFileOf, WorkspaceIssue } from "../load-workspace.ts";
import { type LibraryList, libraryLists } from "./agent-references.ts";
import type { CheckContext } from "./check-context.ts";

type Hub = LoadedFileOf<"hub">;

/**
 * Each shared item a hub lists in `uses` is shared at the workspace root,
 * with the same code an agent gets for an item that doesn't exist. Without
 * it a typo there passes until an agent of the hub relies on the list
 * (C337 C16, HAL-14270). An item whose shared file was read but failed its
 * own checks isn't reported.
 */
export function checkHubUses(context: CheckContext): WorkspaceIssue[] {
  return context
    .filesOf("hub")
    .flatMap((hub) => libraryLists.flatMap((list) => usesIssues(context, hub, list)));
}

function usesIssues(context: CheckContext, hub: Hub, list: LibraryList): WorkspaceIssue[] {
  // A shared file that failed has its own errors; repeating them here would hide them (HAL-12126).
  const shared = context.nameableIds(list.kind, null);
  const listed = hub.value.uses?.[list.key] ?? [];
  return listed.flatMap((item, index) => {
    if (shared.has(item)) {
      return [];
    }
    const message = `Hub "${hub.value.id}" uses unknown ${list.noun} "${item}"`;
    return [context.error(hub.path, ["uses", list.key, index], `unknown-${list.kind}`, message)];
  });
}
