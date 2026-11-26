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
  /** Shows `kept` again while it still exists; resolves whether it does. */
  reopen(kept: string): Promise<boolean>;
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
      reopen: (kept) => messenger.reopen(kept),
    };
  },
  inbox: (services) => {
    if (!services.has(InboxService)) return undefined;
    const inbox = services.get(InboxService);
    return {
      field: "item",
      current: () => inbox.shownItem.key,
      watch: (watcher) => inbox.shownItem.watch(watcher),
      reopen: (kept) => reopenItem(inbox, kept),
    };
  },
};

/**
 * A focused app's window shows the chat or item it showed again while it still exists, else its
 * app's start screen, and from then on keeps the workspace and what it shows
 * (`studio.window-content`, `messenger.window-chat`, `inbox.window-item`). The kept chat or item
 * counts only for the workspace it was kept with. Resolves once the window keeps what it shows;
 * the returned function stops keeping it.
 */
export async function keepFocusedContent(
  keeper: WindowContentKeeper,
  shown: ShownInApp | undefined,
  workspace: string,
  content: WindowContent,
): Promise<() => void> {
  if (shown === undefined) {
    await keeper.keep({ workspace });
    return () => {};
  }
  const kept = content.workspace === workspace ? content[shown.field] : undefined;
  const reopened = kept !== undefined && (await reopenOrSay(shown, kept));
  // Until the page takes the ask, it still shows nothing: keep what it was asked to show.
  const now = shown.current() ?? (reopened ? kept : undefined);
  await keeper.keep({ workspace, [shown.field]: now });
  const stop = shown.watch(() => {
    void keeper.keep({ workspace, [shown.field]: shown.current() });
  });
  return stop;
}

async function reopenOrSay(shown: ShownInApp, kept: string): Promise<boolean> {
  try {
    return await shown.reopen(kept);
  } catch (error) {
    console.error(`The window couldn't show its ${shown.field} again:`, error);
    return false;
  }
}
