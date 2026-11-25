// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** A phone's window, 390px wide with a touchscreen: each `(width < Npx)` query matches below N. */
function phoneMediaQueries(query: string): MediaQueryList {
  const below = Number(/\(width < (\d+)px\)/.exec(query)?.[1] ?? Number.NaN);
  return {
    matches: query === "(pointer: coarse)" || 390 < below,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

/** A run of Acme's that waits for your OK on Writer's `read_note`. */
const waiting = {
  id: "run_acme1",
  status: "waiting",
  workflowId: "reply",
  hubId: "support",
  startedAt: "2026-11-19T10:00:00.000Z",
  lastSeq: 4,
  accepts: ["approve", "reject"],
  approvals: [
    {
      agent: "writer",
      tool: "read_note",
      connector: "notes",
      args: {},
      callId: "call_1",
      at: "2026-11-19T10:00:01.000Z",
      state: "draft",
      branch: null,
      item: null,
    },
  ],
};

let element: HTMLElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  window.matchMedia = phoneMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
});

/** The first element under `selector` whose text matches `text`, once the window has drawn it. */
function shown(selector: string, text: RegExp): Promise<HTMLElement> {
  return vi.waitFor(
    () => {
      const match = [...element.querySelectorAll<HTMLElement>(selector)].find((each) =>
        text.test(each.textContent ?? ""),
      );
      expect(match).toBeDefined();
      return match as HTMLElement;
    },
    { timeout: 4_000 },
  );
}

verifies("studio.served-inbox-trust", () => {
  it("says where to fix the trust on a phone, with no Review and no Open run", {
    timeout: 20_000,
  }, async () => {
    started = startStudio({
      element,
      window,
      userAgent: "Mozilla/5.0 (Linux; Android 15)",
      fetch: async (path) => {
        if (path === "/api/workspace") {
          return Response.json({ name: "Acme", sample: false, folder: "~/Projects/acme" });
        }
        if (path.startsWith("/api/runs/")) {
          return Response.json(
            { code: "workspace_not_trusted", message: "This workspace isn't trusted." },
            { status: 403 },
          );
        }
        if (path === "/api/google/setups") {
          return Response.json({ signIn: "elsewhere", setups: [] });
        }
        return Response.json({ runs: [waiting], agents: { writer: "Writer" } });
      },
    });
    expect(started.host).toBe("phone");

    (await shown('nav[aria-label="Places"] a', /Inbox$/)).click();
    (await shown("main [role=gridcell]", /Writer wants to use read_note/)).click();
    // A button's text holds its busy label too: "ApproveApproving…".
    (await shown("main button", /^Approve/)).click();

    await vi.waitFor(
      () => expect(element.textContent).toContain("Fix this on your computer: Settings › Trust"),
      { timeout: 4_000 },
    );
    expect(element.textContent).toContain(
      "This workspace isn't trusted yet, so Halonic can't send your answer.",
    );
    const buttons = [...element.querySelectorAll("main button")].map((b) => b.textContent);
    expect(buttons).not.toContain("Open run");
    expect(buttons).not.toContain("Review");
  });
});
