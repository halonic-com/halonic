// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import {
  createToastStore,
  PresentationProvider,
  type ToastStore,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import type { InboxRequests, RequestWorkflow } from "../request/inbox-requests.ts";
import { pendingApproval, waitingRun } from "../test-runs.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const support: RequestWorkflow = {
  key: "support/support-reply",
  name: "Support reply",
  label: "Answer a customer's email",
  description: 'A customer\'s email, for example: "Hi, my order #1042 arrived damaged."',
};
const travel: RequestWorkflow = {
  key: "ops/book-travel",
  name: "Book travel",
  label: "Book travel",
};

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function fakeRequests(offered: readonly RequestWorkflow[], start?: InboxRequests["start"]) {
  const started = vi.fn(start ?? (async () => ({ runId: "r9", hubId: "acme" })));
  const requests: InboxRequests = {
    offered: async () => offered,
    subscribe: () => () => {},
    start: started,
  };
  return { requests, started };
}

async function open(
  requests: InboxRequests | undefined,
  options: { phone?: boolean; openRun?: (hubId: string, runId: string) => void } = {},
) {
  const toasts: ToastStore = createToastStore();
  const waiting = waitingRun("r1", {
    approvals: [pendingApproval("call-1", "notes-mcp__create_note", new Date().toISOString())],
  });
  const inbox = new Inbox(fakeRuns([waiting]).runs);
  const view = (
    <ToastStoreProvider store={toasts}>
      <InboxView inbox={inbox} requests={requests} openRun={options.openRun} />
    </ToastStoreProvider>
  );
  const root = render(
    options.phone ? <PresentationProvider presentation="phone">{view}</PresentationProvider> : view,
  );
  await settled();
  return { root, toasts };
}

function message(root: HTMLElement): HTMLTextAreaElement {
  const found = root.querySelector("textarea");
  if (found === null) throw new Error("no Message field");
  return found;
}

async function type(field: HTMLTextAreaElement, text: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function button(root: HTMLElement, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`no button "${name}"`);
  return found;
}

async function send(root: HTMLElement) {
  await act(async () => {
    button(root, "Send").click();
  });
  await settled();
}

verifies("inbox.request", () => {
  describe("what the pane offers", () => {
    it("shows the one workflow's label, its description as the placeholder, and Send", async () => {
      const { root } = await open(fakeRequests([support]).requests);
      expect(root.querySelector('[data-pane="item"] h2')?.textContent).toBe(
        "Answer a customer's email",
      );
      expect(message(root).placeholder).toBe(support.description);
      expect(root.querySelector("select")).toBeNull();
      expect(button(root, "Send").disabled).toBe(false);
    });

    it("asks What do you need? when the workflow has no description", async () => {
      const { root } = await open(fakeRequests([travel]).requests);
      expect(message(root).placeholder).toBe("What do you need?");
    });

    it("offers a Request type picker with several workflows", async () => {
      const { root } = await open(fakeRequests([support, travel]).requests);
      const labels = [...root.querySelectorAll("option")].map((option) => option.textContent);
      expect(labels).toEqual([support.label, travel.label]);
      expect(root.textContent).toContain("Request type");
    });

    it("shows no form and no New request without a workflow to start", async () => {
      for (const requests of [undefined, fakeRequests([]).requests]) {
        const { root } = await open(requests);
        expect(root.querySelector("textarea")).toBeNull();
        expect(root.textContent).not.toContain("New request");
        unmountAll();
      }
    });
  });

  describe("on a phone", () => {
    it("shows a New request row and no form until it is pressed", async () => {
      const { root } = await open(fakeRequests([support]).requests, { phone: true });
      expect(root.querySelector("textarea")).toBeNull();
      expect(root.querySelector("dialog")).toBeNull();
      await act(async () => {
        button(root, "New request").click();
      });
      const sheet = root.querySelector("dialog");
      expect(sheet?.textContent).toContain("Answer a customer's email");
      expect(message(root).value).toBe("");
      expect(message(root).placeholder).toBe(support.description);
    });

    it("sends from the sheet, closes it and says the run started", async () => {
      const { requests, started } = fakeRequests([support]);
      const { root, toasts } = await open(requests, { phone: true });
      await act(async () => {
        button(root, "New request").click();
      });
      await type(message(root), "Hi, my order arrived damaged.");
      await send(root);
      expect(started).toHaveBeenCalledWith(support.key, "Hi, my order arrived damaged.");
      expect(root.querySelector("dialog")).toBeNull();
      expect(toasts.list().map((toast) => toast.title)).toEqual(["Support reply started"]);
    });

    it("keeps the sheet and says what is missing on an empty Send", async () => {
      const { requests, started } = fakeRequests([support]);
      const { root } = await open(requests, { phone: true });
      await act(async () => {
        button(root, "New request").click();
      });
      await send(root);
      expect(started).not.toHaveBeenCalled();
      expect(root.querySelector("dialog")?.textContent).toContain("Write a message first.");
    });
  });

  describe("sending", () => {
    it("starts the picked workflow with the trimmed message, clears it and says it started", async () => {
      const { requests, started } = fakeRequests([support, travel]);
      const { root, toasts } = await open(requests);
      await type(message(root), "  Hi, my order arrived damaged.  ");
      await send(root);
      expect(started).toHaveBeenCalledWith(support.key, "Hi, my order arrived damaged.");
      expect(message(root).value).toBe("");
      expect(toasts.list().map((toast) => toast.title)).toEqual(["Support reply started"]);
    });

    it("gives the toast Open run, which opens the run it started", async () => {
      const { requests } = fakeRequests([support]);
      const openRun = vi.fn();
      const { root, toasts } = await open(requests, { openRun });
      await type(message(root), "Hello");
      await send(root);
      const action = toasts.list()[0]?.action;
      expect(action?.label).toBe("Open run");
      action?.onClick();
      expect(openRun).toHaveBeenCalledWith("acme", "r9");
    });

    it("has no Open run where the page can't open a run", async () => {
      const { requests } = fakeRequests([support]);
      const { root, toasts } = await open(requests);
      await type(message(root), "Hello");
      await send(root);
      expect(toasts.list()[0]?.action).toBeUndefined();
    });

    it("says Working… and keeps focus on Send while the run starts", async () => {
      let finish: (() => void) | undefined;
      const { requests } = fakeRequests(
        [support],
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ runId: "r9", hubId: "acme" });
          }),
      );
      const { root } = await open(requests);
      await type(message(root), "Hello");
      const sendButton = button(root, "Send");
      sendButton.focus();
      await send(root);
      // The kit keeps both labels in the button and shows the busy one: aria-busy says which.
      expect(sendButton.getAttribute("aria-busy")).toBe("true");
      expect(sendButton.textContent).toContain("Working…");
      expect(document.activeElement).toBe(sendButton);
      await act(async () => finish?.());
      expect(sendButton.getAttribute("aria-busy")).toBeNull();
    });

    it("asks for a message first when it is empty, and focuses it", async () => {
      const { requests, started } = fakeRequests([support]);
      const { root } = await open(requests);
      await type(message(root), "   ");
      await send(root);
      expect(started).not.toHaveBeenCalled();
      expect(root.textContent).toContain("Write a message first.");
      expect(document.activeElement).toBe(message(root));
    });

    it("says Not started with the reason, keeps the message and keeps the line in the page", async () => {
      const { requests } = fakeRequests([support], async () => {
        throw new KindedError("denied", "fin@acme.example is signed out.");
      });
      const { root } = await open(requests);
      const alert = root.querySelector('[role="alert"]');
      expect(alert?.textContent).toBe("");
      await type(message(root), "Hello");
      await send(root);
      expect(root.querySelector('[role="alert"]')).toBe(alert);
      expect(alert?.textContent).toBe("Not started: fin@acme.example is signed out.");
      expect(message(root).value).toBe("Hello");
    });
    it("keeps a capitalised name in the reason as written", async () => {
      const { requests } = fakeRequests([support], async () => {
        throw new KindedError("denied", "Gmail is signed out.");
      });
      const { root } = await open(requests);
      await type(message(root), "Hello");
      await send(root);
      expect(root.querySelector('[role="alert"]')?.textContent).toBe(
        "Not started: Gmail is signed out.",
      );
    });

    it("sends once and keeps working state and refusal when a card is opened meanwhile", async () => {
      let settle: (error?: Error) => void = () => {};
      const { requests, started } = fakeRequests([support], () => {
        return new Promise((resolve, reject) => {
          settle = (error) => (error ? reject(error) : resolve({ runId: "r9", hubId: "acme" }));
        });
      });
      const { root } = await open(requests);
      await type(message(root), "Hello");
      await act(async () => {
        button(root, "Send").click();
      });
      const row = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
      await act(async () => {
        row?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        row?.click();
      });
      await act(async () => {
        button(root, "New request").click();
      });
      expect(button(root, "Send").getAttribute("aria-busy")).toBe("true");
      await send(root);
      expect(started).toHaveBeenCalledTimes(1);
      await act(async () => {
        settle(new KindedError("denied", "Gmail is signed out."));
      });
      await settled();
      expect(root.querySelector('[role="alert"]')?.textContent).toBe(
        "Not started: Gmail is signed out.",
      );
    });
  });

  describe("keeping the text", () => {
    it("keeps the message while a card is open, and New request brings the form back", async () => {
      const { root } = await open(fakeRequests([support]).requests);
      await type(message(root), "Half a thought");
      const row = root.querySelector<HTMLElement>('[role="grid"] tr [role="gridcell"]');
      await act(async () => {
        row?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        row?.click();
      });
      expect(root.querySelector("textarea")).toBeNull();
      await act(async () => {
        button(root, "New request").click();
      });
      expect(message(root).value).toBe("Half a thought");
      expect(document.activeElement).toBe(message(root));
    });

    it("shows the form with focus in Message when another page asks for it, even before the Inbox shows", async () => {
      const inbox = new Inbox(fakeRuns([waitingRun("r1", {})]).runs);
      inbox.requestNewRequest();
      const root = render(
        <ToastStoreProvider store={createToastStore()}>
          <InboxView inbox={inbox} requests={fakeRequests([support]).requests} />
        </ToastStoreProvider>,
      );
      await settled();
      expect(document.activeElement).toBe(message(root));
      expect(inbox.takeNewRequest()).toBe(false);
    });

    it("goes back to the list on Esc and keeps the text", async () => {
      const { root } = await open(fakeRequests([support]).requests);
      await type(message(root), "Keep me");
      await act(async () => {
        message(root).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });
      expect(document.activeElement).toBe(
        root.querySelector('[data-pane="list"] [role="gridcell"]'),
      );
      expect(message(root).value).toBe("Keep me");
    });
  });
});
