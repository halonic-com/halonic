import type { LibraryItemKind } from "@halonicjs/app";
import type { PlaceViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState } from "react";
import type { CollectionRef } from "../collection-host.ts";
import { LibraryItemsHostService } from "../library-items-host.ts";
import type { LibraryEntryPlace } from "../library-overview.ts";
import { LibraryTabMemoryService } from "../library-tab-memory.ts";
import { takeLibraryTabRequests } from "../library-tab-request.ts";
import { NewCollectionHostService } from "../new-collection-host.ts";
import { NewSkillHostService } from "../new-skill-host.ts";
import { requestSkillInstructionsFocus } from "../skill-focus-request.ts";
import type { SkillRef } from "../skill-host.ts";
import { LibraryPage } from "./library-page.tsx";
import { NewCollectionDialog } from "./new-collection-dialog.tsx";
import { NewSkillDialog } from "./new-skill-dialog.tsx";

/**
 * The hub in an item's tab key (`kind/hub/id`), which has to name one: what the workspace shares
 * has no hub, so it opens under this name, which no hub id can be (ids start with a letter).
 */
export const sharedHubKey = "~workspace";

function refOf(kind: LibraryItemKind, { hub, id }: LibraryEntryPlace) {
  return { kind, hub: hub ?? sharedHubKey, id };
}

function newButtonOf(
  kind: LibraryItemKind,
  opens: Partial<Record<LibraryItemKind, (() => void) | undefined>>,
): (() => void) | undefined {
  return opens[kind];
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
  const newSkillHost = context.services.find(NewSkillHostService);
  const [makingSkill, setMakingSkill] = useState(false);
  const newCollectionHost = context.services.find(NewCollectionHostService);
  const [makingCollection, setMakingCollection] = useState(false);
  const { openItem, openItemInNewTab } = context;
  const openSkill = ({ hub, id }: SkillRef) =>
    openItem?.({ kind: "skill", hub: hub ?? sharedHubKey, id });
  const openCollection = ({ hub, id }: CollectionRef) =>
    openItem?.({ kind: "collection", hub: hub ?? sharedHubKey, id });
  const prepareThen = (host: { prepare(): Promise<void> }, open: () => void) =>
    void host
      .prepare()
      .catch(() => undefined)
      .then(open);
  // Skills and Collections have a New dialog so far; the other tabs show no button until theirs lands.
  // The dialog opens even if the read failed: it has fallbacks, and Create shows its own error.
  const onNew = newButtonOf(kind, {
    skill: newSkillHost && (() => prepareThen(newSkillHost, () => setMakingSkill(true))),
    collection:
      newCollectionHost && (() => prepareThen(newCollectionHost, () => setMakingCollection(true))),
  });
  return (
    <>
      <LibraryPage
        host={host}
        kind={kind}
        onKindChange={show}
        onOpen={(each, entry) => openItem?.(refOf(each, entry))}
        onOpenInNewTab={(each, entry) => openItemInNewTab?.(refOf(each, entry))}
        {...(onNew === undefined ? {} : { onNew })}
      />
      {makingSkill && newSkillHost !== undefined && (
        <NewSkillDialog
          host={newSkillHost}
          onCreated={(skill) => {
            setMakingSkill(false);
            requestSkillInstructionsFocus(skill);
            openSkill(skill);
          }}
          onCancel={() => setMakingSkill(false)}
        />
      )}
      {makingCollection && newCollectionHost !== undefined && (
        <NewCollectionDialog
          host={newCollectionHost}
          onCreated={(collection) => {
            setMakingCollection(false);
            openCollection(collection);
          }}
          onCancel={() => setMakingCollection(false)}
        />
      )}
    </>
  );
}
