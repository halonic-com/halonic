import type { ItemRef } from "@halonicjs/studio-shell";
import { placeOf } from "@halonicjs/workspace";

/** The kinds whose items have a page of their own, which their file can open as. */
const kindsWithPage = ["agent", "workflow", "routine"] as const;

/** A kind a file can open as: an agent, a workflow or a routine. */
export type KindWithPage = (typeof kindsWithPage)[number];

/** The item a file defines, and its kind's name for the menu. */
export interface FileAsItem {
  readonly kind: KindWithPage;
  readonly item: ItemRef;
}

function hasPage(kind: string): kind is KindWithPage {
  return (kindsWithPage as readonly string[]).includes(kind);
}

/**
 * The agent, workflow or routine a file defines, from where it sits in the workspace, so the
 * file's tab can open it as that item (files flow 4.2); `undefined` for any other file. An item at
 * the workspace's top has the empty hub, as the Changes page opens it.
 *
 * @example
 * fileAsItem("hubs/p/agents/sorter.agent.yaml"); // { kind: "agent", item: { kind: "agent", hub: "p", id: "sorter" } }
 * fileAsItem("models.yaml"); // undefined
 */
export function fileAsItem(path: string): FileAsItem | undefined {
  const place = placeOf(path);
  if (place?.placeId === undefined || !hasPage(place.kind)) return undefined;
  return {
    kind: place.kind,
    item: { kind: place.kind, hub: place.hub ?? "", id: place.placeId },
  };
}
