// @vitest-environment jsdom

import type { SyncDiagnostics } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { button, press, settle } from "../test-support/dom.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SyncDiagnosticsView } from "./sync-diagnostics-section.tsx";
import { spanText } from "./sync-diagnostics-words.ts";

afterEach(unmountAll);

const diagnostics: SyncDiagnostics = {
  windowMs: 2 * 60 * 60_000,
  updates: {
    event: { count: 1, share: 0.25 },
    poll: { count: 3, share: 0.75 },
    "catch-up": { count: 0, share: 0 },
    write: { count: 0, share: 0 },
  },
  eventLag: { count: 0, p50Ms: null, p95Ms: null },
  pollLag: { count: 3, p50Ms: 1200, p95Ms: 4000 },
  missedByEvents: 0,
  reconnects: 2,
  connection: "polling-only",
  timeIn: { connected: 0, "polling-only": 2 * 60 * 60_000 + 12 * 60_000, "not-allowed": 0 },
  routes: [
    {
      method: "GET",
      route: "companies/:company/issues",
      count: 6,
      p50Ms: 310,
      p95Ms: 900,
      failed: 1,
      bytes: 4096,
    },
  ],
};

/** The row's label and value, as the description list shows them. */
function rowText(container: HTMLElement, label: string): string | undefined {
  const term = [...container.querySelectorAll("dt")].find((dt) => dt.textContent === label);
  return term?.nextElementSibling?.textContent ?? undefined;
}

verifies("connections.sync-diagnostics", () => {
  describe("Settings › Sync diagnostics", () => {
    it("shows each source's share, the delays, the time and each call", async () => {
      const view = render(<SyncDiagnosticsView reader={{ read: async () => diagnostics }} />);
      await settle();

      const container = view;
      expect(container.textContent).toContain("Counted since Halonic started, 2 h ago.");
      expect(container.textContent).toContain(
        "Live updates are off, so Halonic checks Paperclip for changes regularly.",
      );
      expect(rowText(container, "Regular checks")).toBe("3 (75%)");
      expect(rowText(container, "Live updates")).toBe("1 (25%)");
      expect(rowText(container, "Delay of regular checks")).toBe(
        "1.2 s typical, 4 s for the slowest 5%",
      );
      expect(rowText(container, "Delay of live updates")).toBe("None yet");
      expect(rowText(container, "Live updates reconnected")).toBe("2");
      expect(rowText(container, "Time checking only")).toBe("2 h 12 min");
      expect(rowText(container, "Time live updates weren't allowed")).toBe("0 min");
      const cells = [...container.querySelectorAll("tbody tr > *")].map((cell) => cell.textContent);
      expect(cells).toEqual([
        "GET companies/:company/issues",
        "6",
        "1",
        "310 ms",
        "900 ms",
        "4 KB",
      ]);
    });

    it("heads its parts one level under the section's title, in the dialog and on the phone", async () => {
      const read = async () => diagnostics;
      const inDialog = render(<SyncDiagnosticsView reader={{ read }} surface="window" />);
      const onPhone = render(<SyncDiagnosticsView reader={{ read }} surface="phone" />);
      await settle();

      const headings = (view: HTMLElement, level: string) =>
        [...view.querySelectorAll(level)].map((heading) => heading.textContent);
      const parts = ["How changes arrived", "Delays and connection", "Paperclip calls"];
      expect(headings(inDialog, "h4")).toEqual(parts);
      expect(headings(onPhone, "h2")).toEqual(parts);
      const calls = inDialog.querySelectorAll("section")[2];
      expect(calls?.getAttribute("aria-labelledby")).toBe(calls?.querySelector("h4")?.id);
    });

    it("shows Reading… on the button until the read ends", async () => {
      let answer: (read: SyncDiagnostics) => void = () => undefined;
      const read = () =>
        new Promise<SyncDiagnostics>((resolve) => {
          answer = resolve;
        });
      const view = render(<SyncDiagnosticsView reader={{ read }} />);
      await settle();
      expect(view.querySelector('[aria-busy="true"]')?.textContent).toContain("Reading…");

      answer({ ...diagnostics, windowMs: 24 * 60 * 60_000 });
      await settle();
      expect(view.querySelector('[aria-busy="true"]')).toBeNull();
      expect(view.textContent).not.toContain("Counted since");
      await press(button("Read again", view));
      expect(view.querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it("says when the read failed, and Try again reads again", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      const read = vi
        .fn<() => Promise<SyncDiagnostics>>()
        .mockRejectedValueOnce(new Error("The agent host isn't answering."))
        .mockResolvedValueOnce(diagnostics);
      const view = render(<SyncDiagnosticsView reader={{ read }} />);
      await settle();

      expect(view.querySelector('[role="alert"]')?.textContent).toBe(
        "Sync diagnostics couldn't be read.",
      );
      await press(button("Try again", view));
      await settle();

      expect(read).toHaveBeenCalledTimes(2);
      expect(rowText(view, "Regular checks")).toBe("3 (75%)");
    });
  });

  it("writes long stretches in hours and minutes", () => {
    expect(spanText(0)).toBe("0 min");
    expect(spanText(30_000)).toBe("under 1 min");
    expect(spanText(45 * 60_000)).toBe("45 min");
    expect(spanText(3 * 60 * 60_000)).toBe("3 h");
  });
});
