import type { StudioHost } from "../engine/engine-words.ts";
import { ResourceStatusItem } from "../resources/resource-status-item.tsx";
import type { ResourceWatch } from "../resources/resource-watch.ts";

/** The memory and disk item: only the desktop app, and only when it passed the engine's report. */
export function DesktopResourceItem({
  host,
  resources,
}: {
  readonly host: StudioHost;
  readonly resources: ResourceWatch | undefined;
}) {
  if (host !== "desktop-app" || resources === undefined) {
    return null;
  }
  return <ResourceStatusItem watch={resources} />;
}
