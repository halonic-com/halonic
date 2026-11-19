import { createToastStore } from "@halonicjs/studio-kit";
import { SaveState } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { OutsideChange } from "./files-host.ts";
import { followFilesHost } from "./follow-host.ts";

function setup() {
  const outside = new Map<string, OutsideChange>();
  const listeners = new Set<() => void>();
  const reloads = new Set<(paths: readonly string[]) => void>();
  const watchLimits = new Set<(reason: string) => void>();
  const host = {
    outside: () => outside,
    subscribe: (listener: () => void) => (
      listeners.add(listener), () => listeners.delete(listener)
    ),
    onReloaded: (listener: (paths: readonly string[]) => void) => (
      reloads.add(listener), () => reloads.delete(listener)
    ),
    onWatchLimit: (listener: (reason: string) => void) => (
      watchLimits.add(listener), () => watchLimits.delete(listener)
    ),
  };
  const toasts = createToastStore();
  const saving = new SaveState(toasts);
  const opened: string[] = [];
  const stop = followFilesHost({ host, toasts, saving, open: (path) => opened.push(path) });
  const hold = (path: string) => {
    outside.set(path, "changed");
    for (const listener of listeners) listener();
  };
  const release = (path: string) => {
    outside.delete(path);
    for (const listener of listeners) listener();
  };
  const reload = (paths: string[]) => {
    for (const listener of reloads) listener(paths);
  };
  const reachLimit = (reason: string) => {
    for (const listener of watchLimits) listener(reason);
  };
  return { toasts, saving, opened, stop, hold, release, reload, reachLimit };
}

verifies("files.follow-host", () => {
  it("says one reloaded file by name", () => {
    const { toasts, reload } = setup();
    reload(["hubs/p/a.agent.yaml"]);
    expect(toasts.list().map((toast) => toast.title)).toEqual([
      "Reloaded a.agent.yaml: changed outside Halonic",
    ]);
  });

  it("says a batch once, by count", () => {
    const { toasts, reload } = setup();
    reload(Array.from({ length: 12 }, (_, index) => `f${index}.yaml`));
    expect(toasts.list().map((toast) => toast.title)).toEqual([
      "Reloaded 12 files changed outside Halonic",
    ]);
  });

  it("puts a held file in the save note, and Compare opens its tab", () => {
    const { saving, opened, hold } = setup();
    hold("hubs/p/a.agent.yaml");
    expect(saving.note).toMatchObject({ kind: "items-not-saved", count: 1 });
    saving.compare();
    expect(opened).toEqual(["hubs/p/a.agent.yaml"]);
  });

  it("stops naming a file once it is settled", () => {
    const { saving, hold, release } = setup();
    hold("a.md");
    release("a.md");
    expect(saving.note).toEqual({ kind: "saved" });
  });

  it("gives the watch's file limit in one warning toast that stays", () => {
    const { toasts, reachLimit } = setup();
    reachLimit("This folder has too many files to watch.");
    expect(toasts.list()).toEqual([
      expect.objectContaining({
        tone: "warning",
        title: "This folder has too many files to watch.",
        sticky: true,
      }),
    ]);
  });

  it("shows nothing after it stops", () => {
    const { toasts, stop, reload, reachLimit } = setup();
    stop();
    reload(["a.md"]);
    reachLimit("This folder has too many files to watch.");
    expect(toasts.list()).toEqual([]);
  });
});
