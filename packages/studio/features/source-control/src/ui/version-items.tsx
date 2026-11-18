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
import type { Version } from "../api.ts";
import { groupVersionFiles, type VersionItem } from "../change-items.ts";
import type { ChangesList } from "../changes-list.ts";
import { historyWords, itemWords, mergeWords, restoreWords } from "../changes-words.ts";
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
 * What's in a version (checklist part 2, 2.9 and 2.14): a row for each item it changed, named as
 * the Changes list names it, each with a ⋮ whose one entry is **Restore just this**. While a merge
 * is started the entry waits, with "Finish getting updates first." as its second line.
 */
export function VersionItems({ version, list, headingLevel }: VersionItemsProps) {
  const restoring = useRestoreItem(list);
  const [menu, setMenu] = useState<{ readonly id: string; readonly target: ContextMenuTarget }>();
  const items = groupVersionFiles(version.files);
  const heading = `${historyWords.whatsInIt} · ${historyWords.fileCount(version.files.length)}`;
  if (items.length === 0) {
    return (
      <>
        <ListHeading name={historyWords.whatsInIt} headingLevel={headingLevel} />
        <p className="text-body text-fg-muted">{historyWords.noFiles}</p>
      </>
    );
  }
  const menuItem = items.find((item) => item.id === menu?.id);
  const rows: ListRow[] = items.map((item) => ({
    id: item.id,
    title: item.name,
    // The details show the files in the version (`source-control.history-page`); the icon says the kind.
    meta: item.paths.join(", "),
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
