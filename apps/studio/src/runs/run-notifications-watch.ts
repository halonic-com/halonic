import type { Disposable, ServiceRegistry } from "@halonicjs/app";
import {
  type RunNotificationsWatch,
  type RunsReader,
  runNotificationSettingsOf,
  watchRunNotifications,
} from "@halonicjs/studio-feature-runs";
import {
  type AllRunsFeed,
  AllRunsService,
  notifiableRun,
} from "@halonicjs/studio-feature-runs/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type { NoticeTarget, Notifier } from "@halonicjs/studio-services";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/** The open folder's run notifications; the folder's registry stops them when it closes. */
export const runNotificationsWatchKey: ServiceKey<Disposable> = serviceKey<Disposable>(
  "studio.run-notifications-watch",
);

/** What the run notifications need from the window. */
export interface RunNotificationsParts {
  /** The window's desktop notifications, such as the shell's `ShellNotifier`. */
  readonly notifier: Notifier;
  /** Opens Runs on the run or on the Failed group that a clicked notification names. */
  readonly open: (target: NoticeTarget) => void;
  /** Hears a read or a notification that failed; the watch goes on. */
  readonly onError: (error: unknown) => void;
  /** The folder's trust: an untrusted folder asks the agent host nothing, so the watch waits for it. */
  readonly trust: {
    mayStartNow(): boolean;
    subscribe(listener: () => void): () => void;
  };
  readonly now?: () => Date;
}

/**
 * Starts the run notifications (`runs.run-notifications`) for the open folder, over the Runs app's
 * runs of the workspace and its teams, with the switches saved under Settings › Notifications ›
 * Runs (requirement `studio.run-notifications-watch`), once the folder is trusted. Without the
 * Runs app's runs, which need the agent host, nothing starts.
 */
export function provideRunNotifications(
  services: ServiceRegistry,
  { notifier, open, onError, trust, now = () => new Date() }: RunNotificationsParts,
): void {
  if (!services.has(AllRunsService) || !services.has(HostSettingsService)) return;
  const host = services.get(HostSettingsService);
  const runs = services.get(AllRunsService);
  let watch: RunNotificationsWatch | undefined;
  const startOnceTrusted = () => {
    if (watch !== undefined || !trust.mayStartNow()) return;
    watch = watchRunNotifications(allRunsReader(runs), notifier, {
      // Read on every change, so a switch turned off in Settings counts from the next run on.
      settings: () => runNotificationSettingsOf(host),
      now,
      open,
      onError,
    });
  };
  const unsubscribe = trust.subscribe(startOnceTrusted);
  startOnceTrusted();
  services.provide(runNotificationsWatchKey, {
    dispose: async () => {
      unsubscribe();
      await watch?.stop();
    },
  });
}

/**
 * The Runs app's runs as the watch reads them. Listening keeps the Runs app reading its sources;
 * a read waits for their first answer, so the runs already there when the folder opens show nothing.
 */
export function allRunsReader(all: AllRunsFeed): RunsReader {
  return {
    read: async () => {
      if (!all.state.loaded) await all.refresh();
      return all.state.rows.map(notifiableRun);
    },
    changes: () => feedChanges(all),
  };
}

/** One change per read of the Runs app; reads that land while nobody asks count as one. */
function feedChanges(all: AllRunsFeed): AsyncIterable<void> {
  return {
    [Symbol.asyncIterator]() {
      let changed = false;
      let ended = false;
      let wake: (() => void) | undefined;
      // Listen at once, not on the first `next`: the watch listens before its first read.
      const unsubscribe = all.subscribe(() => {
        changed = true;
        wake?.();
      });
      return {
        async next(): Promise<IteratorResult<void>> {
          if (!changed && !ended) await new Promise<void>((resolve) => (wake = resolve));
          changed = false;
          wake = undefined;
          return ended ? { done: true, value: undefined } : { done: false, value: undefined };
        },
        async return(): Promise<IteratorResult<void>> {
          ended = true;
          unsubscribe();
          wake?.();
          return { done: true, value: undefined };
        },
      };
    },
  };
}
