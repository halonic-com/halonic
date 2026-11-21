import type { PhonePageMemory, PlaceViewProps } from "@halonicjs/studio-shell";
import { useEffect, useMemo, useState } from "react";
import type { Version } from "../api.ts";
import type { ChangeItem } from "../change-items.ts";
import type { ReturnFocus } from "./use-open-item.ts";

/**
 * The phone's page stack as the Changes view uses it (checklist part 2, 2.13 and 2.14): an item's
 * What changed and a version open as pages of their own above the Changes page, so the top bar
 * names them and its Back, and Android's, return to the list.
 */
export interface ChangesPhonePages {
  /** The page shown: `undefined` for the Changes page, else the `sub` of a page pushed above it. */
  readonly sub: string | undefined;
  /** The Changes page's memory, where it notes the row a page was pushed from. */
  readonly memory: PhonePageMemory | undefined;
  /** Pushes a page above the Changes page, named `title` in the top bar. */
  readonly open: (sub: string, title: string) => void;
  /** Goes back from the page `sub`, while it shows. */
  readonly close: (sub: string) => void;
}

/** A page pushed above the Changes page: an item's What changed, or a version's page. */
export type PushedPage =
  | { readonly kind: "item"; readonly id: string }
  | { readonly kind: "version"; readonly id: string };

/**
 * The `sub` of a pushed page: `item:` or `version:` and the id. The id is encoded, so the slash in
 * an other file's id (`file:notes/plan.bin`) can't make it look like a deeper page.
 */
export function subOf(page: PushedPage): string {
  return `${page.kind}:${encodeURIComponent(page.id)}`;
}

/** The page a `sub` names, or `undefined` for one this view never pushed. */
export function pushedPageOf(sub: string): PushedPage | undefined {
  const colon = sub.indexOf(":");
  const kind = sub.slice(0, colon);
  if (colon < 0 || (kind !== "item" && kind !== "version")) return undefined;
  try {
    return { kind, id: decodeURIComponent(sub.slice(colon + 1)) };
  } catch {
    return undefined;
  }
}

/** The phone's pages from the place view's props; `undefined` for a context built without a window. */
export function useChangesPhonePages({
  context,
  sub,
  memory,
}: PlaceViewProps): ChangesPhonePages | undefined {
  const { openPlacePage, closePlacePage } = context;
  return useMemo(
    () =>
      openPlacePage === undefined || closePlacePage === undefined
        ? undefined
        : {
            sub,
            memory,
            open: (page: string, title: string) => openPlacePage("changes", page, title),
            close: (page: string) => closePlacePage("changes", page),
          },
    [openPlacePage, closePlacePage, sub, memory],
  );
}

/** What the Changes page needs to open its pages on a phone, and where focus goes back to. */
export interface PhoneOpening {
  readonly openItem: (id: string) => void;
  readonly openVersion: (id: string) => void;
  /** The item row to put focus on, back from its What changed, or the row that took its place. */
  readonly itemFocus: ReturnFocus | undefined;
  /** The version row to put focus on, back from its page. */
  readonly versionFocus: string | undefined;
}

/**
 * Opens an item or a version as a page above the Changes page, noting its row in the page's
 * memory first, and reads that row back when the page shows again, as after Back. The note is
 * taken once, so a later Back from another page, such as an item opened from a row's ⋮, leaves
 * focus on the heading. Without the phone's pages, as on the desktop, there is nothing to open.
 */
export function usePhoneOpening(
  pages: ChangesPhonePages | undefined,
  items: readonly ChangeItem[],
  versions: readonly Version[],
): PhoneOpening | undefined {
  const memory = pages?.memory;
  const [kept] = useState(() => memory?.row);
  useEffect(() => {
    if (memory !== undefined) memory.row = undefined;
  }, [memory]);
  if (pages === undefined) return undefined;
  const back = kept === undefined ? undefined : pushedPageOf(kept.id);
  const open = (page: PushedPage, index: number, title: string) => {
    const sub = subOf(page);
    if (memory !== undefined) memory.row = { id: sub, index };
    pages.open(sub, title);
  };
  return {
    openItem: (id) => {
      const index = items.findIndex((item) => item.id === id);
      const item = items[index];
      if (item !== undefined) open({ kind: "item", id }, index, item.name);
    },
    openVersion: (id) => {
      const index = versions.findIndex((version) => version.id === id);
      const version = versions[index];
      if (version !== undefined) open({ kind: "version", id }, index, version.name);
    },
    itemFocus:
      back?.kind === "item" && kept !== undefined ? { id: back.id, index: kept.index } : undefined,
    versionFocus: back?.kind === "version" ? back.id : undefined,
  };
}
