import {
  Callout,
  type CalloutHandle,
  ContextMenu,
  type ContextMenuTarget,
  List,
  ListHeading,
  type ListRow,
} from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { ChangesSource, Version } from "../api.ts";
import { type ChangeItem, groupVersionFiles, type VersionItem } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import type { ChangedFile } from "../changes-list-state.ts";
import {
  historyWords,
  itemWords,
  mergeWords,
  restoreWords,
  versionWords,
} from "../changes-words.ts";
import { versionFiles } from "../version-files.ts";
import { orderItems } from "./change-list.tsx";
import { ItemIcon } from "./item-icon.tsx";
import { type RestoreItem, useRestoreItem } from "./use-restore-item.ts";

/** Props for {@link VersionItems}. */
export interface VersionItemsProps {
  readonly version: Version;
  readonly list: ChangesList;
  /** The level of the What's in it heading: 2 on the phone's version page, 4 in the desktop's details. */
  readonly headingLevel: 2 | 4;
}

/**
 * What's in a version (checklist part 2, 2.9 and 2.14): a row for each item it changed, with the
 * icon, name and kind the Changes list gives it and no path (`source-control.history-page`), each
 * with a ⋮ whose one entry is **Restore just this**. While a merge
 * is started the entry waits, with "Finish getting updates first." as its second line.
 */
export function VersionItems({ version, list, headingLevel }: VersionItemsProps) {
  const restoring = useRestoreItem(list);
  const [menu, setMenu] = useState<{ readonly id: string; readonly target: ContextMenuTarget }>();
  const items = useVersionItems(list.source, version.files);
  const itemCount = groupVersionFiles(version.files).length;
  const heading = `${historyWords.whatsInIt} · ${versionWords.itemCount(itemCount)}`;
  if (version.files.length === 0) {
    return (
      <>
        <ListHeading name={historyWords.whatsInIt} headingLevel={headingLevel} />
        <p className="text-body text-fg-muted">{historyWords.noFiles}</p>
      </>
    );
  }
  if (items === undefined) {
    // No row until the names are read, so no id shows before its name does.
    return (
      <div aria-busy="true">
        <ListHeading name={heading} headingLevel={headingLevel} />
      </div>
    );
  }
  const menuItem = items.find((item) => item.id === menu?.id);
  const rows: ListRow[] = items.map((item) => ({
    id: item.id,
    title: item.name,
    meta: item.kind === undefined ? undefined : itemWords.kind[item.kind],
    icon: <ItemIcon kind={item.kind} />,
    more: {
      label: itemWords.moreActionsFor(item.name),
      onClick: (event) => setMenu({ id: item.id, target: { element: event.currentTarget } }),
    },
  }));
  return (
    <div className="flex flex-col gap-3">
      <List heading={{ name: heading }} headingLevel={headingLevel} rows={rows} />
      <RestorePartialCallout restoring={restoring} />
      <ContextMenu
        label={menuItem?.name ?? heading}
        entries={menuItem === undefined ? [] : [restoreEntry(version, menuItem, restoring, list)]}
        target={menu?.target}
        onClose={() => setMenu(undefined)}
      />
    </div>
  );
}

/**
 * The items of a version once their names are read from their files as they are now, in the
 * Changes list's order; `undefined` while they are read.
 */
function useVersionItems(
  source: ChangesSource,
  paths: readonly string[],
): readonly VersionItem[] | undefined {
  const [read, setRead] = useState<{
    readonly paths: readonly string[];
    readonly files: readonly ChangedFile[];
  }>();
  useEffect(() => {
    let current = true;
    void versionFiles(source, paths).then((files) => {
      if (current) setRead({ paths, files });
    });
    return () => {
      current = false;
    };
  }, [source, paths]);
  return read?.paths === paths ? orderItems(read.files).map(asVersionItem) : undefined;
}

/** A Changes list item as a version's item: the paths of its files are what Restore puts back. */
function asVersionItem(item: ChangeItem): VersionItem {
  return {
    id: item.id,
    name: item.name,
    kind: item.kind,
    paths: item.files.map((file) => file.path),
  };
}

function restoreEntry(
  version: Version,
  item: VersionItem,
  restoring: RestoreItem,
  list: ChangesList,
) {
  return {
    id: "restore",
    label: restoreWords.restoreJustThis,
    unavailable: list.merging ? { reason: mergeWords.finishFirst } : undefined,
    onSelect: () => void restoring.restore(version, item),
  };
}

/**
 * The warning when Restore just this failed and so did putting the files back (2.9, as 2.5): the
 * files not as they were, up to three then "and N more", with Try again; focus moves to it.
 */
function RestorePartialCallout({ restoring }: { readonly restoring: RestoreItem }) {
  const callout = useRef<CalloutHandle>(null);
  const { partial } = restoring;
  useEffect(() => {
    if (partial !== undefined) callout.current?.focus();
  }, [partial]);
  if (partial === undefined) return null;
  return (
    <Callout
      ref={callout}
      announce="focus"
      tone="warning"
      title={restoreWords.partialTitle(partial.item.name, partial.version.name)}
      files={partial.paths}
      action={{
        label: restoreWords.tryAgain,
        busyLabel: restoreWords.tryAgainBusy,
        onClick: restoring.retry,
      }}
    >
      {restoreWords.partialBody(partial.paths.length, partial.reason)}
    </Callout>
  );
}
