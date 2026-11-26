import { InboxService, reopenItem } from "@halonicjs/studio-feature-inbox/api";
import { MessengerService } from "@halonicjs/studio-feature-messenger/api";
import type { ServiceTarget } from "@halonicjs/studio-shell";
import type { WindowContent, WindowContentKeeper } from "./window-content.ts";

/** What a focused app shows inside its workspace, and how to show it again. */
export interface ShownInApp {
  /** The field of {@link WindowContent} it keeps. */
  readonly field: "chat" | "item";
  /** What the app shows now, by id or key. */
  current(): string | undefined;
  /** Calls `watcher` with each change. Returns the way to stop. */
  watch(watcher: () => void): () => void;
  /**
   * Shows `kept` again while it still exists; resolves whether it does. Once `signal` aborts, it
   * stops waiting and asks for nothing.
   */
  reopen(kept: string, signal: AbortSignal): Promise<boolean>;
}

/** A focused app's window keeping what it shows. */
export interface KeptFocusedContent {
  /** Settles once the window has shown its chat or item again, or the start screen, and kept it. */
  readonly ready: Promise<void>;
  /** Stops keeping at once, without waiting for the chat or item to show again. */
  stop(): void;
}

/**
 * What the focused app `app` shows in a workspace with `services`: the Messenger's chat or the
 * Inbox's item, or `undefined` for another app, or when the workspace doesn't have it.
 */
export function shownInApp(app: string, services: ServiceTarget): ShownInApp | undefined {
  return shownBy[app]?.(services);
}

/** The Messenger's chat and the Inbox's item, by focused app, when the workspace has the app. */
const shownBy: Record<string, (services: ServiceTarget) => ShownInApp | undefined> = {
  messenger: (services) => {
    if (!services.has(MessengerService)) return undefined;
    const messenger = services.get(MessengerService);
    return {
      field: "chat",
      current: () => messenger.shown.id,
      watch: (watcher) => messenger.shown.watch(watcher),
      reopen: (kept, signal) => messenger.reopen(kept, signal),
    };
  },
  inbox: (services) => {
    if (!services.has(InboxService)) return undefined;
    const inbox = services.get(InboxService);
    return {
      field: "item",
      current: () => inbox.shownItem.key,
      watch: (watcher) => inbox.shownItem.watch(watcher),
      reopen: (kept, signal) => reopenItem(inbox, kept, signal),
    };
  },
};

/**
 * A focused app's window shows the chat or item it showed again while it still exists, else its
 * app's start screen, and from then on keeps the workspace and what it shows
 * (`studio.window-content`, `messenger.window-chat`, `inbox.window-item`). The kept chat or item
 * counts only for the workspace it was kept with. Stopping never waits on the chat or item, which
 * can wait on a stuck engine.
 */
export function keepFocusedContent(
  keeper: WindowContentKeeper,
  shown: ShownInApp | undefined,
  workspace: string,
  content: WindowContent,
): KeptFocusedContent {
  if (shown === undefined) return { ready: keeper.keep({ workspace }), stop: () => {} };
  const stopping = new AbortController();
  // Watch first, so a chat or item opened while the window asks for the kept one is kept too.
  const unwatch = shown.watch(() => {
    if (stopping.signal.aborted) return;
    void keeper.keep({ workspace, [shown.field]: shown.current() });
  });
  const ready = showAndKeep(keeper, shown, workspace, content, stopping.signal);
  return {
    ready,
    stop: () => {
      stopping.abort();
      unwatch();
    },
  };
}

async function showAndKeep(
  keeper: WindowContentKeeper,
  shown: ShownInApp,
  workspace: string,
  content: WindowContent,
  signal: AbortSignal,
): Promise<void> {
  const kept = content.workspace === workspace ? content[shown.field] : undefined;
  const reopened = kept !== undefined && (await reopenOrSay(shown, kept, signal));
  if (signal.aborted) return;
  // Until the page takes the ask, it still shows nothing: keep what it was asked to show.
  const now = shown.current() ?? (reopened ? kept : undefined);
  await keeper.keep({ workspace, [shown.field]: now });
}

async function reopenOrSay(shown: ShownInApp, kept: string, signal: AbortSignal): Promise<boolean> {
  try {
    return await shown.reopen(kept, signal);
  } catch (error) {
    console.error(`The window couldn't show its ${shown.field} again:`, error);
    return false;
  }
}
