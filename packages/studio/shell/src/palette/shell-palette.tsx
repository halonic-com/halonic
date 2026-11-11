import { isComposing, type ToastStore } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { Announcer } from "../announcer/announcer.ts";
import { errorMessageFor } from "../errors/error-message.ts";
import { isModalDialogOpen } from "../frame/frame-effects.ts";
import type { CommandContribution, SearchProviderContribution } from "../points/commands.ts";
import type { ItemRef } from "../points/item-kinds.ts";
import type { KeyboardPlatform } from "../points/keybindings.ts";
import type { Registered } from "../points/point-store.ts";
import { openLocation } from "../tabs/open-location.ts";
import { currentLocation, type TabLocation, type TabSet } from "../tabs/tab-set.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { CommandPalette } from "./command-palette.tsx";
import { itemLocationKey, type PaletteRow, paletteGroups } from "./palette-groups.ts";
import { kindInSentence, type PaletteKindNames } from "./palette-options.ts";
import type { RecentPlaces } from "./recent-places.ts";
import { usePaletteSearch } from "./use-palette-search.ts";

/** Props for {@link ShellPalette}. */
export interface ShellPaletteProps {
  /** The open workspace's tabs: the Open tabs group, and where a pick opens. */
  readonly tabs: TabSet;
  /** The places opened lately in the workspace: the Recent group, and the ranking among equals. */
  readonly recent: RecentPlaces;
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
  /** Esc, a click outside, and a pick that opens here or runs an action. */
  readonly onClose: () => void;
}

/**
 * The Ctrl K palette, joined to a workspace (component specs 24.3, UX checklist 1.7): it owns the
 * words, asks the search providers as they change, and ranks the open tabs, the recent places,
 * what the providers found and the commands with `paletteGroups`.
 *
 * A place or an item opens here, which closes the palette, or with Mod in a new tab next to the
 * active one: the palette stays open with the focus in its search row, and the announcer says
 * "Opened *Refund checker* in a new tab." A place a tab already shows becomes the active tab.
 * An action closes the palette and then runs with its own feature's context; one that fails says
 * so in a danger toast.
 *
 * Render it while the palette is open; each opening starts with an empty box.
 *
 * @example
 * {paletteOpen ? (
 *   <ShellPalette tabs={workspace.tabs} recent={workspace.recent}
 *     providers={shell.contributions.search.providers()} commands={shell.contributions.commands.list()}
 *     kinds={shell.contributions.itemKinds} contextFor={contextFor} announcer={shell.announcer}
 *     toasts={shell.toasts} notAnswering={shell.engine.words.notAnswering} platform={platform}
 *     onClose={() => setPaletteOpen(false)} />
 * ) : null}
 */
export function ShellPalette(props: ShellPaletteProps) {
  const { tabs, recent, kinds, contextFor, announcer, onClose } = props;
  const [words, setWords] = useState("");
  const openTabs = useOpenTabs(tabs);
  const recentPlaces = useRecentPlaces(recent);
  const search = usePaletteSearch(words, props.providers, contextFor);
  const content = paletteGroups({
    words,
    openTabs,
    recent: recentPlaces,
    found: search.found.results,
    searchFailed: search.found.failed,
    actions: props.commands,
  });

  const onOpen = (row: PaletteRow, inNewTab: boolean) => {
    const target = row.target;
    if (target.kind === "action") {
      onClose();
      runAction(props.commands, target.command, contextFor, props.toasts);
      return;
    }
    const location =
      target.kind === "location" ? target.location : itemLocation(target.item, row.label, kinds);
    if (!inNewTab) {
      onClose();
    }
    openLocation(tabs, announcer, location, inNewTab);
  };

  return (
    <CommandPalette
      words={words}
      onWordsChange={setWords}
      content={content}
      searching={search.searching}
      platform={props.platform}
      kinds={kinds}
      notAnswering={props.notAnswering}
      announcer={announcer}
      onOpen={onOpen}
      onTryAgain={search.tryAgain}
      onCancel={onClose}
    />
  );
}

/**
 * Opens the palette on Mod K (Ctrl K, or Cmd K on macOS), in the desktop app and served alike.
 * It is left alone while a modal dialog is open (the palette's own Mod K selects its words),
 * while an input method composes, and when a part of the page has already handled it.
 *
 * @example
 * usePaletteKey(platform, () => setPaletteOpen(true));
 */
export function usePaletteKey(platform: KeyboardPlatform, open: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isComposing(event) || isModalDialogOpen()) {
        return;
      }
      if (isPaletteKey(event, platform)) {
        event.preventDefault();
        open();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform, open]);
}

function isPaletteKey(event: KeyboardEvent, platform: KeyboardPlatform): boolean {
  const mod = platform === "macos" ? event.metaKey : event.ctrlKey;
  const otherMod = platform === "macos" ? event.ctrlKey : event.metaKey;
  return mod && !otherMod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k";
}

/** The place that shows an item a provider found, named as the row names it. */
function itemLocation(item: ItemRef, label: string, kinds: PaletteKindNames): TabLocation {
  const kind = kinds.get(item.kind)?.label;
  return {
    key: itemLocationKey(item),
    title: label,
    ...(kind === undefined ? {} : { kind: kindInSentence(kind) }),
  };
}

/** Runs a command with its own feature's context; a failure becomes a danger toast. */
function runAction(
  commands: readonly Registered<CommandContribution>[],
  id: string,
  contextFor: (featureId: string) => WorkspaceContext,
  toasts: ToastStore,
): void {
  const command = commands.find((candidate) => candidate.id === id);
  if (command === undefined) {
    return;
  }
  const failed = (error: unknown) => {
    const message = errorMessageFor(error, { title: `Couldn't run ${command.title}.` });
    toasts.show({ tone: "danger", title: message.title, text: message.body });
  };
  // Started inside a promise, so a command that throws at once fails like one that rejects.
  void Promise.resolve()
    .then(() => command.run(contextFor(command.featureId)))
    .catch(failed);
}

function useOpenTabs(tabs: TabSet): readonly TabLocation[] {
  const subscribe = useCallback((listener: () => void) => tabs.subscribe(listener), [tabs]);
  const state = useSyncExternalStore(subscribe, () => tabs.state);
  return state.tabs.map(currentLocation);
}

function useRecentPlaces(recent: RecentPlaces): readonly TabLocation[] {
  const subscribe = useCallback((listener: () => void) => recent.subscribe(listener), [recent]);
  return useSyncExternalStore(subscribe, () => recent.list);
}
