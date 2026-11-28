// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** A window `width` px wide; a phone's has a touchscreen. Each `(width < Npx)` query matches below N. */
function mediaQueries(width: number, touch: boolean) {
  return (query: string): MediaQueryList => {
    const below = Number(/\(width < (\d+)px\)/.exec(query)?.[1] ?? Number.NaN);
    return {
      matches: (touch && query === "(pointer: coarse)") || width < below,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    };
  };
}

const mail = "Hi, my order #1042 arrived damaged. Can I get a refund? — Sam (invented)";
const reply = "Sorry your order arrived damaged, Sam.\n\nAcme support";
const note = "Approving finishes the run. Nothing is sent.";

/** Acme's run of Support reply, waiting at `review` with the test model's draft. */
const review = {
  id: "run_acme2",
  hubId: "support",
  workflowId: "support-reply",
  kind: "run",
  status: "waiting",
  state: "review",
  startedAt: "2026-11-26T07:20:00.000Z",
  lastSeq: 6,
  waitingOn: null,
  accepts: ["approve", "reject"],
  answerLabels: { approve: "Approve", reject: "Reject" },
  nextTimer: null,
  waitingFor: { title: "Approve this reply?", body: `${reply}\n\n${note}` },
  lastWaitingAt: "2026-11-26T07:21:00.000Z",
  approvals: [],
};

/** What `GET /api/waiting-runs` says about it, as `halonic serve` reads Acme's files and the run's log. */
const context = {
  run_acme2: {
    workflow: "Support reply",
    description: `Approve this reply?\n{{context.reply}}\n\n${note}`,
    startInput: mail,
    sample: true,
  },
};

let element: HTMLElement;
let started: StartedStudio | undefined;

beforeEach(() => {
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
      expect(match, `${selector} ${text}`).toBeDefined();
      return match as HTMLElement;
    },
    { timeout: 4_000 },
  );
}

/** Acme's run after Approve when it moves on to a second wait step, `send`, with its own description. */
const sending = {
  ...review,
  state: "send",
  lastSeq: 8,
  waitingFor: { title: "Send this reply?", body: reply },
  lastWaitingAt: "2026-11-26T07:22:00.000Z",
};

/**
 * The served Studio on Acme, its waiting list holding `review` until it is approved. Then the run
 * leaves the list, or, when it `movesOn`, waits at `send`, whose description has no closing words.
 */
function startServed(userAgent: string, movesOn: boolean): StartedStudio {
  let approved = false;
  const afterApprove = movesOn
    ? {
        runs: [sending],
        agents: {},
        context: {
          run_acme2: { ...context.run_acme2, description: "Send this reply?\n{{context.reply}}" },
        },
      }
    : { runs: [], agents: {}, context: {} };
  return startStudio({
    element,
    window,
    userAgent,
    fetch: async (path, init) => {
      if (path === "/api/workspace") {
        return Response.json({ name: "Acme", sample: true, folder: "~/Projects/acme" });
      }
      if (path === "/api/google/setups") return Response.json({ signIn: "elsewhere", setups: [] });
      if (path === `/api/runs/${review.id}/events` && init?.method === "POST") {
        approved = true;
        return Response.json(
          movesOn ? sending : { ...review, status: "done", state: "replied", waitingFor: null },
        );
      }
      return Response.json(approved ? afterApprove : { runs: [review], agents: {}, context });
    },
  });
}

/** The card's draft box, its meta line and its caption, checked in order: meta, title, quote, draft. */
function expectContext(): void {
  const card = element.querySelector("main section");
  const meta = card?.querySelector("p");
  expect(meta?.textContent).toBe("Support reply · Sample answers");
  const quote = card?.querySelector("blockquote");
  const draft = card?.querySelector("[data-draft]");
  expect(quote?.textContent).toContain(mail);
  expect(draft?.textContent).toContain("Sorry your order arrived damaged, Sam.");
  expect(draft?.textContent).not.toContain(note);
  // The served Studio has no run page.
  expect(card?.textContent).not.toContain("Open run");
  expect(card?.textContent).not.toContain("Started by");
  if (quote == null || draft == null) return;
  expect(quote.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

verifies("studio.served-wait-context", () => {
  const hosts = [
    { name: "desktop", width: 1440, touch: false, userAgent: "Mozilla/5.0 (X11; Linux x86_64)" },
    { name: "phone", width: 390, touch: true, userAgent: "Mozilla/5.0 (Linux; Android 15)" },
  ];
  for (const host of hosts) {
    for (const movesOn of [false, true]) {
      const after = movesOn ? "the run moves on to its next wait" : "the run leaves the list";
      it(`says what Acme's review answers in a ${host.name} browser, before and after Approve, when ${after}`, {
        timeout: 20_000,
      }, async () => {
        window.matchMedia = mediaQueries(host.width, host.touch);
        started = startServed(host.userAgent, movesOn);

        // Home's Needs you row starts with the same meta line.
        await shown('main [aria-label="Needs you"] span', /^Support reply · Sample answers · run/);
        // The rail's Inbox on the desktop, the bottom navigation's on a phone.
        const inbox =
          host.name === "phone"
            ? shown('nav[aria-label="Places"] a', /Inbox/)
            : shown('nav[aria-label="Apps"] li button[aria-label^="Inbox"]', /.*/);
        (await inbox).click();
        // Home stays drawn behind the Inbox, so its Needs you row is left out.
        const inboxRow = 'main table:not([aria-label="Needs you"]) [role=gridcell]';
        (await shown(inboxRow, /Support reply · Sample answers · run/)).click();
        await shown("main section h2", /^Approve this reply\?$/);
        expectContext();
        const caption = await shown("main section p", new RegExp(`^${note}$`));
        expect(caption.closest("[data-draft]")).toBeNull();

        // A button's text holds its busy label too: "ApproveApproving…".
        (await shown("main section button", /^Approve/)).click();
        await shown("main section", /Approved by you at/);
        expectContext();
        // The next step's description is never this card's, so the caption stays out of the box.
        expect(element.querySelector("main section [data-draft]")?.textContent).not.toContain(note);
      });
    }
  }
});
