import type { LibraryItemKind } from "@halonicjs/app";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState } from "react";
import { LibraryItemsHostService } from "../library-items-host.ts";
import type { LibraryEntryPlace } from "../library-overview.ts";
import { LibraryTabMemoryService } from "../library-tab-memory.ts";
import { takeLibraryTabRequests } from "../library-tab-request.ts";
import { LibraryPage } from "./library-page.tsx";

/**
 * The hub in an item's tab key (`kind/hub/id`), which has to name one: what the workspace shares
 * has no hub, so it opens under this name, which no hub id can be (ids start with a letter).
 */
export const sharedHubKey = "~workspace";

function refOf(kind: LibraryItemKind, { hub, id }: LibraryEntryPlace) {
  return { kind, hub: hub ?? sharedHubKey, id };
}

/**
 * The Library place's page: {@link LibraryPage} over the open workspace's items. It opens on the
 * tab the workspace was last on (Skills the first time), shows the tab an Alt+4 to Alt+7 command
 * asks for, and remembers the tab it ends on.
 */
export function LibraryPlace({ context }: PlaceViewProps) {
  const host = context.services.get(LibraryItemsHostService);
  const memory = context.services.get(LibraryTabMemoryService);
  const [kind, setKind] = useState<LibraryItemKind>(() => memory.get() ?? "skill");
  const show = useCallback(
    (next: LibraryItemKind) => {
      setKind(next);
      memory.set(next);
    },
    [memory],
  );
  useEffect(() => takeLibraryTabRequests(show), [show]);
  const { openItem, openItemInNewTab } = context;
  return (
    <LibraryPage
      host={host}
      kind={kind}
      onKindChange={show}
      onOpen={(each, entry) => openItem?.(refOf(each, entry))}
      onOpenInNewTab={(each, entry) => openItemInNewTab?.(refOf(each, entry))}
    />
  );
}
