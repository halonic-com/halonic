import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { aboutView, checkAnnouncement } from "./about-state.ts";
import type { UpdateState, UpdateStatus } from "./updater-status.ts";

const now = new Date(2026, 10, 14, 15, 0);
const checkedToday = new Date(2026, 10, 14, 9, 12).getTime();
const checkedEarlier = new Date(2026, 10, 3, 9, 12).getTime();

function status(state: UpdateState, rest: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: "0.1.0",
    automatic: true,
    checking: false,
    lastChecked: checkedToday,
    justUpdated: null,
    managed: null,
    state,
    ...rest,
  };
}

const notesUrl = "https://example.test/notes";

verifies("settings.about-section", () => {
  it("says up to date with when, and that automatic updates are off", () => {
    expect(aboutView(status({ kind: "up-to-date" }), now).line).toBe(
      "Up to date. Checked today at 09:12.",
    );
    expect(
      aboutView(
        status({ kind: "up-to-date" }, { automatic: false, lastChecked: checkedEarlier }),
        now,
      ).line,
    ).toBe("Automatic updates are off. Checked 3 Nov at 09:12.");
  });

  it("says never checked", () => {
    const view = aboutView(status({ kind: "never-checked" }, { lastChecked: null }), now);
    expect(view.line).toBe("Not checked for updates yet.");
    expect(view.actions).toEqual([]);
  });

  it("words each way a check fails calmly, with the last check only when there was one", () => {
    const line = (reason: "offline" | "no-answer" | "unreadable", lastChecked: number | null) =>
      aboutView(status({ kind: "cant-check", reason }, { lastChecked }), now).line;
    expect(line("offline", checkedEarlier)).toBe(
      "Couldn't check for updates: you're offline. Last checked 3 Nov at 09:12.",
    );
    expect(line("no-answer", null)).toBe(
      "Couldn't check for updates: the update server didn't answer.",
    );
    expect(line("unreadable", null)).toContain("sent something Halonic couldn't read");
    expect(aboutView(status({ kind: "cant-check", reason: "offline" }), now).callout).toBe(false);
  });

  it("offers Download and the release notes when an update is available", () => {
    const view = aboutView(status({ kind: "available", version: "0.1.1", notesUrl }), now);
    expect(view.line).toBe("Halonic 0.1.1 is available. You have 0.1.0.");
    expect(view.actions).toEqual(["download"]);
    expect(view.notesUrl).toBe(notesUrl);
  });

  it("shows progress from the first byte, with a fraction only when the total is known", () => {
    const downloading = (done: number, total: number | null) =>
      aboutView(status({ kind: "downloading", version: "0.1.1", done, total, unit: "bytes" }), now);
    const known = downloading(12_000_000, 48_000_000);
    expect(known.line).toBe("Downloading Halonic 0.1.1… 12 of 48 MB");
    expect(known.progress?.fraction).toBe(0.25);
    expect(known.actions).toEqual(["cancel"]);
    const unknown = downloading(400_000, null);
    expect(unknown.line).toBe("Downloading Halonic 0.1.1… 0.4 MB");
    expect(unknown.progress?.fraction).toBeNull();
  });

  it("words a failed download with a reason and offers Try again", () => {
    const view = aboutView(
      status({ kind: "download-failed", version: "0.1.1", reason: "disk" }),
      now,
    );
    expect(view.line).toBe(
      "Couldn't download Halonic 0.1.1: there isn't enough room on the disk. Halonic tries again at the next check.",
    );
    expect(view.actions).toEqual(["try-again"]);
  });

  it("shows a signature that doesn't match as a Callout and never says verified or safe", () => {
    const view = aboutView(
      status({ kind: "signature-mismatch", version: "0.1.1", attempts: 2 }),
      now,
    );
    expect(view.callout).toBe(true);
    expect(view.line).toContain("its signature doesn't match Halonic's");
    expect(view.line).toContain("Halonic 0.1.0 keeps working.");
    expect(view.line).not.toMatch(/verified|safe|secure/i);
  });

  it("says ready, and didn't install with Try again", () => {
    expect(aboutView(status({ kind: "ready", version: "0.1.1", notesUrl }), now).line).toBe(
      "Halonic 0.1.1 is ready. It installs when you restart or quit Halonic.",
    );
    const failed = aboutView(
      status({ kind: "did-not-install", version: "0.1.1", attempts: 1 }),
      now,
    );
    expect(failed.line).toBe("Halonic 0.1.1 didn't install. You're still on 0.1.0.");
    expect(failed.actions).toEqual(["try-again"]);
  });

  it("offers no button when another tool manages updates", () => {
    const managed = { by: "scoop", command: "scoop update halonic" } as const;
    for (const state of [
      { kind: "available", version: "0.1.1", notesUrl },
      { kind: "downloading", version: "0.1.1", done: 1, total: 2, unit: "bytes" },
      { kind: "did-not-install", version: "0.1.1", attempts: 1 },
    ] as const) {
      expect(aboutView(status(state, { managed }), now).actions).toEqual([]);
    }
  });

  it("announces a check's result with the version, also when nothing changed", () => {
    expect(checkAnnouncement(status({ kind: "up-to-date" }), now)).toBe(
      "Halonic 0.1.0 is up to date. Checked today at 09:12.",
    );
    expect(checkAnnouncement(status({ kind: "cant-check", reason: "offline" }), now)).toBe(
      "Couldn't check for updates: you're offline.",
    );
    expect(checkAnnouncement(status({ kind: "available", version: "0.1.1", notesUrl }), now)).toBe(
      "Halonic 0.1.1 is available.",
    );
  });
});
