import type { ItemRef } from "@halonicjs/studio-shell";
import { type ReactNode, useEffect } from "react";
import type { Version } from "../api.ts";
import type { ChangeItem } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { MergeChoices } from "./merge-choices.tsx";
import { type ChangesPhonePages, pushedPageOf } from "./phone-pages.ts";
import type { OpenItem } from "./use-open-item.ts";
import { VersionPage } from "./version-page.tsx";
import { WhatChangedPage } from "./whats-changed-page.tsx";

/**
 * The page drawn instead of the Changes page on a phone, if one is open: a page on the stack above
 * it (`sub`), the Get updates choices, or an item's What changed opened in place. The desktop
 * draws these in the content pane beside the list (`source-control.list-column`).
 */
export function pushedPage({
  list,
  pages,
  items,
  nav,
  openItem,
  phone,
}: {
  readonly list: ChangesList;
  readonly pages: ChangesPhonePages | undefined;
  readonly items: readonly ChangeItem[];
  readonly nav: OpenItem;
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly phone: boolean;
}): ReactNode | undefined {
  if (!phone) return undefined;
  if (pages?.sub !== undefined) {
    return (
      <PhonePushedPage
        list={list}
        items={items}
        versions={list.state.history.versions}
        openItem={openItem}
        close={pages.close}
        sub={pages.sub}
      />
    );
  }
  if (nav.open !== undefined) {
    return (
      // The page draws its own inset, so its bottom bar can run edge to edge.
      <div className="flex min-h-full w-full flex-col">
        <WhatChangedPage
          list={list}
          item={nav.open}
          developer={false}
          openItem={openItem}
          onBack={nav.back}
          phone
        />
      </div>
    );
  }
  if (list.state.merge !== undefined && list.state.choosing) {
    return (
      // The page draws its own inset, so its bottom bar can run edge to edge.
      <div className="flex min-h-full w-full flex-col">
        <MergeChoices list={list} phone />
      </div>
    );
  }
  return undefined;
}

/**
 * On a phone, the page pushed above the Changes page: an item's What changed (2.13) or a version's
 * page (2.14), under a top bar that names it and has Back. When the item or the version is gone, as
 * after Undo these changes, the page closes and the list shows again.
 */
function PhonePushedPage({
  list,
  items,
  versions,
  openItem,
  close,
  sub,
}: {
  readonly list: ChangesList;
  readonly items: readonly ChangeItem[];
  readonly versions: readonly Version[];
  readonly openItem: ((item: ItemRef) => void) | undefined;
  readonly close: (sub: string) => void;
  readonly sub: string;
}) {
  const page = pushedPageOf(sub);
  const item = page?.kind === "item" ? items.find((each) => each.id === page.id) : undefined;
  const version =
    page?.kind === "version" ? versions.find((each) => each.id === page.id) : undefined;
  const gone = item === undefined && version === undefined;
  useEffect(() => {
    if (gone) close(sub);
  }, [gone, close, sub]);
  if (item !== undefined) {
    return (
      <div className="flex min-h-full w-full flex-col">
        {/* The phone's What changed has no developer view: its changes are in words only. */}
        <WhatChangedPage list={list} item={item} developer={false} openItem={openItem} phone />
      </div>
    );
  }
  if (version !== undefined) {
    return (
      // The page draws its own inset, so its bottom bar can run edge to edge.
      <div className="flex min-h-full w-full flex-col">
        <VersionPage version={version} list={list} />
      </div>
    );
  }
  return null;
}
