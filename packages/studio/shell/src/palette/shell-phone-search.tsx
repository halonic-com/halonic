import type { ToastStore } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import type { CommandContribution, SearchProviderContribution } from "../points/commands.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import type { TabLocation } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { itemLocation, type PaletteRow, paletteGroups } from "./palette-groups.ts";
import type { PaletteKindNames } from "./palette-options.ts";
import { PhoneSearchSheet } from "./phone-search-sheet.tsx";
import type { RecentPlaces } from "./recent-places.ts";
import { runAction, useRecentPlaces } from "./shell-palette.tsx";
import { usePaletteSearch } from "./use-palette-search.ts";

/** Props for {@link ShellPhoneSearch}. */
export interface ShellPhoneSearchProps {
  /** The places opened lately on the phone: the Recent group, and the ranking among equals. */
  readonly recent: Pick<RecentPlaces, "list" | "subscribe">;
  /** `shell.contributions.search.providers()`. */
  readonly providers: readonly Registered<SearchProviderContribution>[];
  /** `shell.contributions.commands.list()`, the Actions. */
  readonly commands: readonly Registered<CommandContribution>[];
  /** `shell.contributions.itemKinds`, for the name of an item's kind. */
  readonly kinds: PaletteKindNames;
  /** A feature's context in the workspace: `(featureId) => shell.services.contextFor(featureId, target)`. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  readonly announcer: Announcer;
  /** For a failed action. */
  readonly toasts: ToastStore;
  /** Why it couldn't search: `shell.engine.words.notAnswering`. */
  readonly notAnswering: string;
  readonly platform: KeyboardPlatform;
  /** Opens a place or an item on the phone, after the sheet closed: `usePhonePlaces().open`. */
  readonly onOpenLocation: (location: TabLocation) => void;
  /** Close, Android back, and every pick. */
  readonly onClose: () => void;
}

/**
 * The phone's Search sheet, joined to a workspace (component specs 24.3 "On a phone", UX
 * checklist 1.14, microcopy 3.6): it owns the words, asks the search providers as they change,
 * and ranks the recent places, what the providers found and the commands with `paletteGroups`,
 * as Ctrl K does. A phone has no window tabs, so there is no Open tabs group and nothing reads
 * "Switch to tab".
 *
 * Every pick closes the sheet first, so the focus goes back to the top bar's Search before the
 * new page takes it: a place or an item then opens on the phone with `onOpenLocation`, and an
 * action runs with its own feature's context, a failure shown as a danger toast.
 *
 * Render it while the sheet is open; each opening starts with an empty field.
 *
 * @example
 * {searchOpen ? (
 *   <ShellPhoneSearch recent={recent} providers={shell.contributions.search.providers()}
 *     commands={shell.contributions.commands.list()} kinds={shell.contributions.itemKinds}
 *     contextFor={contextFor} announcer={shell.announcer} toasts={shell.toasts}
 *     notAnswering={shell.engine.words.notAnswering} platform={platform}
 *     onOpenLocation={places.open} onClose={() => setSearchOpen(false)} />
 * ) : null}
 */
export function ShellPhoneSearch(props: ShellPhoneSearchProps) {
  const { kinds, contextFor, onClose } = props;
  const [words, setWords] = useState("");
  const recent = useRecentPlaces(props.recent);
  const search = usePaletteSearch(words, props.providers, contextFor);
  const content = paletteGroups({
    words,
    openTabs: [],
    recent,
    found: search.found.results,
    searchFailed: search.found.failed,
    actions: props.commands,
  });

  const onOpen = (row: PaletteRow) => {
    onClose();
    const target = row.target;
    if (target.kind === "action") {
      runAction(props.commands, target.command, contextFor, props.toasts);
    } else if (target.kind === "location") {
      props.onOpenLocation(target.location);
    } else {
      props.onOpenLocation(itemLocation(target.item, row.label, kinds));
    }
  };

  return (
    <PhoneSearchSheet
      words={words}
      onWordsChange={setWords}
      content={content}
      searching={search.searching}
      platform={props.platform}
      kinds={kinds}
      notAnswering={props.notAnswering}
      announcer={props.announcer}
      onOpen={onOpen}
      onTryAgain={search.tryAgain}
      onClose={onClose}
    />
  );
}
