import { MemoryHostSettingsStore } from "@halonicjs/adapter-memory";
import { HostSettings, ServiceRegistry } from "@halonicjs/app";
import { runNotificationPrefs } from "@halonicjs/studio-feature-runs";
import {
  type AllRunsFeed,
  type AllRunsFeedState,
  type AllRunsRow,
  AllRunsService,
} from "@halonicjs/studio-feature-runs/api";
import { HostSettingsService } from "@halonicjs/studio-feature-settings/api";
import type { AgentNotice, NoticeTarget, Notifier } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { provideRunNotifications, runNotificationsWatchKey } from "./run-notifications-watch.ts";

const now = new Date("2026-11-25T15:00:00Z");

function row(id: string, title: string, changes: Partial<AllRunsRow> = {}): AllRunsRow {
  return {
    id,
    phase: "running",
    startedAt: "2026-11-25T14:50:00Z",
    lineage: id,
    cost: { kind: "none" },
    title,
    line: "In Draft",
    where: "Acme Ops",
    by: { kind: "workflow" },
    chip: { word: "Running", tone: "running" },
    label: `Run ${id}, ${title}.`,
    notice: { startedByMe: false },
    ...changes,
  };
}

/** The Runs app's runs, whose rows a test changes and then reports as one read. */
class FakeRuns implements AllRunsFeed {
  state: AllRunsFeedState;
  readonly listeners = new Set<() => void>();

  constructor(rows: readonly AllRunsRow[]) {
    this.state = { rows, failures: [], loaded: true, error: undefined };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async refresh(): Promise<void> {}

  read(rows: readonly AllRunsRow[]): void {
    this.state = { ...this.state, rows };
    for (const listener of this.listeners) listener();
  }
}

/** Stands in for the shell's `ShellNotifier`: keeps each notice and hands out the next one. */
class FakeNotifier implements Notifier {
  readonly shown: AgentNotice[] = [];
  disposed = false;
  readonly clicks: (() => void)[] = [];
  #waiting: ((notice: AgentNotice) => void) | undefined;

  async show(notice: AgentNotice, onClick: () => void): Promise<void> {
    this.shown.push(notice);
    this.clicks.push(onClick);
    this.#waiting?.(notice);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
  }

  next(): Promise<AgentNotice> {
    return new Promise((resolve) => (this.#waiting = resolve));
  }
}

/** The folder's trust, which a test gives once the person trusts the folder. */
class FakeTrust {
  readonly #listeners = new Set<() => void>();
  trusted: boolean;

  constructor(trusted: boolean) {
    this.trusted = trusted;
  }

  mayStartNow(): boolean {
    return this.trusted;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  give(): void {
    this.trusted = true;
    for (const listener of this.#listeners) listener();
  }
}

async function openFolder(rows: readonly AllRunsRow[], trust = new FakeTrust(true)) {
  const services = new ServiceRegistry();
  const runs = new FakeRuns(rows);
  const settings = new HostSettings(new MemoryHostSettingsStore());
  await settings.load();
  const notifier = new FakeNotifier();
  const opened: NoticeTarget[] = [];
  const errors: unknown[] = [];
  services.provide(AllRunsService, runs);
  services.provide(HostSettingsService, settings);
  provideRunNotifications(services, {
    notifier,
    open: (target) => opened.push(target),
    onError: (error) => errors.push(error),
    trust,
    now: () => now,
  });
  return { services, runs, settings, notifier, opened, errors, trust };
}

const failedYesterday = row("w0", "Nightly report", {
  phase: "failed",
  startedAt: "2026-11-24T02:00:00Z",
});
const supportReply = row("w1", "Support reply");

verifies("studio.run-notifications-watch", () => {
  describe("provideRunNotifications", () => {
    it("starts when the folder opens and shows a run that fails, not one that failed before", async () => {
      const folder = await openFolder([failedYesterday, supportReply]);
      expect(folder.services.has(runNotificationsWatchKey)).toBe(true);
      expect(folder.runs.listeners.size).toBe(1);

      const notice = folder.notifier.next();
      folder.runs.read([failedYesterday, { ...supportReply, phase: "failed" }]);

      expect(await notice).toMatchObject({ title: "Support reply failed" });
      expect(folder.notifier.shown).toHaveLength(1);
      folder.notifier.clicks[0]?.();
      expect(folder.opened).toEqual([{ kind: "run", id: "w1" }]);
      expect(folder.errors).toEqual([]);
      await folder.services.dispose();
    });

    it("reads the saved switches: a run the person started that finishes shows, a failure turned off doesn't", async () => {
      const mine = row("w2", "Weekly digest", { notice: { startedByMe: true } });
      const folder = await openFolder([supportReply, mine]);
      await folder.settings.set(runNotificationPrefs.failed, false);

      const notice = folder.notifier.next();
      folder.runs.read([{ ...supportReply, phase: "failed" }, mine]);
      folder.runs.read([
        { ...supportReply, phase: "failed" },
        { ...mine, phase: "succeeded", notice: { startedByMe: true, tookMs: 240_000 } },
      ]);

      expect(await notice).toMatchObject({ title: "Weekly digest finished" });
      expect(folder.notifier.shown.map((each) => each.title)).toEqual(["Weekly digest finished"]);
      await folder.services.dispose();
    });

    it("waits for the folder to be trusted before it reads any runs", async () => {
      const folder = await openFolder([supportReply], new FakeTrust(false));
      expect(folder.runs.listeners.size).toBe(0);

      folder.trust.give();
      expect(folder.runs.listeners.size).toBe(1);
      await folder.services.dispose();
      expect(folder.runs.listeners.size).toBe(0);
    });

    it("stops listening to the runs when the folder closes", async () => {
      const folder = await openFolder([supportReply]);
      await folder.services.dispose();

      expect(folder.runs.listeners.size).toBe(0);
      // Its notifier goes too, so a click on an old notification opens nothing in a closed folder.
      expect(folder.notifier.disposed).toBe(true);
    });

    it("starts nothing without the Runs app's runs, which need the agent host", () => {
      const services = new ServiceRegistry();
      provideRunNotifications(services, {
        notifier: new FakeNotifier(),
        open: () => undefined,
        onError: () => undefined,
        trust: new FakeTrust(true),
      });
      expect(services.has(runNotificationsWatchKey)).toBe(false);
    });
  });
});
